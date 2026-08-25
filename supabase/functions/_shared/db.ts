/**
 * Acesso ao banco com `service_role`.
 *
 * UNICO arquivo do projeto que instancia o cliente e o unico de `_shared/` com
 * import remoto — por isso os demais modulos rodam no vitest sem emular a
 * plataforma.
 *
 * A chave `service_role` ignora RLS. Ela so existe aqui e nunca sai da Edge
 * Function.
 *
 * Implementa: 03-spec.md §Modelo de dados, §Validacao do token
 * Atende: FR-13, FR-14, FR-15, FR-16, FR-18
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

import { AppError } from "./errors.ts";
import type { PortalEnv } from "./env.ts";
import { hashToken } from "./token.ts";
import { windowStart, type RateLimitCounts } from "./ratelimit.ts";

export type ProviderId = "zapi" | "evolution" | "uazapi";

export interface InstanceRow {
  id: string;
  external_id: string;
  label: string;
  provider: ProviderId;
  base_url: string | null;
  credentials: Record<string, string>;
  active: boolean;
}

export function createDb(env: PortalEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Valida o token e devolve a instancia.
 *
 * O ponto critico e o passo unico: hash do token e `external_id` sao casados na
 * MESMA consulta. Validar em duas consultas separadas permitiria usar o token da
 * instancia A na instancia B (SEC-02).
 *
 * Devolve `null` para qualquer falha — token errado, expirado, instancia
 * inexistente ou inativa. Quem chama responde 401 generico para os quatro casos,
 * senao da para enumerar instancias (SEC-03).
 */
export async function validateToken(
  db: SupabaseClient,
  externalId: string,
  token: string,
): Promise<InstanceRow | null> {
  const tokenHash = await hashToken(token);

  const { data, error } = await db
    .from("portal_link_tokens")
    .select(
      "id, expires_at, instance:portal_instances!inner(id, external_id, label, provider, base_url, credentials, active)",
    )
    .eq("token_hash", tokenHash)
    .eq("portal_instances.external_id", externalId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new AppError("internal", `validateToken: ${error.message}`);
  if (!data) return null;

  const instance = (Array.isArray(data.instance) ? data.instance[0] : data.instance) as
    | InstanceRow
    | undefined;
  if (!instance || !instance.active) return null;

  // Marca o uso. O token e multiuso na janela (ADR-003), entao estes campos sao
  // o que distingue "o cliente reabriu o link" de "estao varrendo".
  await db.rpc("portal_touch_token", { p_token_id: data.id }).then(
    () => undefined,
    () => undefined, // falha ao marcar uso nao pode derrubar a reconexao
  );

  return instance;
}

export async function findActiveInstance(
  db: SupabaseClient,
  externalId: string,
): Promise<InstanceRow | null> {
  const { data, error } = await db
    .from("portal_instances")
    .select("id, external_id, label, provider, base_url, credentials, active")
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw new AppError("internal", `findActiveInstance: ${error.message}`);
  return (data as InstanceRow | null) ?? null;
}

/**
 * Emite um token novo, revogando o anterior da instancia.
 *
 * O `upsert` por `instance_id` garante o invariante do FR-14: uma instancia tem
 * no maximo um token vivo. Recebe o hash pronto — o token em claro nunca chega
 * a esta camada.
 */
export async function issueToken(
  db: SupabaseClient,
  instanceId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  const { error } = await db.from("portal_link_tokens").upsert(
    {
      instance_id: instanceId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      last_used_at: null,
      use_count: 0,
    },
    { onConflict: "instance_id" },
  );

  if (error) throw new AppError("internal", `issueToken: ${error.message}`);
}

/** Contagens da janela do rate limit (FR-16). Falha vira contagem zero: o rate
 *  limit e defesa em profundidade e nao pode ser ele a derrubar o servico. */
export async function rateLimitCounts(
  db: SupabaseClient,
  ipHash: string | null,
  externalId: string,
): Promise<RateLimitCounts> {
  const since = windowStart().toISOString();

  const [ipRes, instRes] = await Promise.all([
    ipHash
      ? db
          .from("portal_access_log")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .neq("outcome", "ok")
          .gte("created_at", since)
      : Promise.resolve({ count: 0, error: null }),
    db
      .from("portal_access_log")
      .select("id", { count: "exact", head: true })
      .eq("external_id", externalId)
      .gte("created_at", since),
  ]);

  return {
    ipFailures: ipRes.error ? 0 : (ipRes.count ?? 0),
    instanceRequests: instRes.error ? 0 : (instRes.count ?? 0),
  };
}
