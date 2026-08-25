/**
 * portal-issue-link — emite um link de reconexao sob demanda.
 *
 * Substitui a rotacao em lote do sistema anterior (ADR-003). Antes existiam 14
 * links validos 24h por dia, e a funcao que os rotacionava nao tinha
 * autenticacao nenhuma: um request na URL invalidava todos os links ja enviados
 * aos clientes.
 *
 * Agora o token nasce no incidente e morre com ele, e a emissao exige segredo
 * proprio no cabecalho — o mesmo padrao que outras rotinas agendadas do ambiente
 * ja usam.
 *
 * Chamada pela automacao ao detectar uma instancia caida.
 *
 * Implementa: 03-spec.md §portal-issue-link
 * Atende: FR-14, FR-15, FR-18 · Mitiga: R-08, SEC-06
 */

import { loadEnv } from "../_shared/env.ts";
import { AppError, toAppError } from "../_shared/errors.ts";
import { preflight, isOriginAllowed } from "../_shared/cors.ts";
import { json, fail, readJson, clientIp, requiredString, type ResponseContext } from "../_shared/http.ts";
import { generateToken, hashToken, hashIp, timingSafeEqual, resolveTtlMinutes } from "../_shared/token.ts";
import { createDb, findActiveInstance, issueToken } from "../_shared/db.ts";
import { getAdapter } from "../_shared/adapters/registry.ts";
import { record } from "../_shared/audit.ts";

declare const Deno: { serve(h: (req: Request) => Promise<Response> | Response): void };

/** Um provider so e utilizavel se tiver as credenciais que ele exige. O CHECK do
 *  banco ja garante isso na escrita; aqui a verificacao existe para dar um erro
 *  claro em vez de deixar a chamada ao provider falhar de forma obscura. */
function hasUsableCredentials(provider: string, credentials: Record<string, string>, baseUrl: string | null): boolean {
  switch (provider) {
    case "zapi":
      return Boolean(credentials.token);
    case "evolution":
      return Boolean(credentials.api_key && baseUrl);
    case "uazapi":
      return Boolean(credentials.token && baseUrl);
    default:
      return false;
  }
}

Deno.serve(async (req: Request) => {
  const env = loadEnv();
  const origin = req.headers.get("origin");
  const ctx: ResponseContext = {
    origin,
    allowedOrigins: env.allowedOrigins,
    requestId: crypto.randomUUID(),
  };

  if (req.method === "OPTIONS") return preflight(origin, env.allowedOrigins);
  if (req.method !== "POST") return fail(ctx, "invalid_input");

  // Endpoint de automacao: se veio de um navegador, a origem tem que estar na
  // lista. Chamada servidor-a-servidor nao manda Origin e passa direto — a
  // barreira real dela e o segredo, logo abaixo.
  if (origin && !isOriginAllowed(origin, env.allowedOrigins)) {
    return fail(ctx, "unauthorized");
  }

  const db = createDb(env);
  const ipHash = await hashIp(clientIp(req), env.ipSalt);
  let externalId: string | null = null;

  try {
    // ---- autenticacao: segredo proprio, comparado em tempo constante -------
    const provided = req.headers.get("x-portal-secret") ?? "";
    if (!timingSafeEqual(provided, env.issueSecret)) {
      await record(db, {
        externalId: null,
        action: "issue",
        outcome: "unauthorized",
        ipHash,
        detail: "segredo ausente ou incorreto",
      });
      return fail(ctx, "unauthorized");
    }

    // ---- entrada -----------------------------------------------------------
    const body = await readJson<{ instance?: unknown; ttl_minutes?: unknown; check_only?: unknown }>(req);
    externalId = requiredString(body.instance, "instance");
    const ttlMinutes = resolveTtlMinutes(body.ttl_minutes);
    // check_only: modo de monitoramento. So consulta o status do provider e NAO
    // emite token. O monitor (n8n) usa isso a cada ciclo; so pede a emissao de
    // fato quando decide avisar. Assim o token nasce fresco no aviso e nao e
    // rotacionado a cada checagem — o que invalidaria um link ja enviado.
    const checkOnly = body.check_only === true;

    // ---- instancia ---------------------------------------------------------
    const instance = await findActiveInstance(db, externalId);

    if (!instance) {
      await record(db, { externalId, action: "issue", outcome: "not_found", ipHash });
      return fail(ctx, "not_found");
    }
    if (!instance.active) {
      await record(db, {
        externalId, instanceId: instance.id, action: "issue", outcome: "inactive", ipHash,
      });
      return fail(ctx, "inactive");
    }
    if (!hasUsableCredentials(instance.provider, instance.credentials, instance.base_url)) {
      // Recusar aqui e o que impede o R-05: mandar ao cliente um link que so vai
      // falhar quando ele abrir. Melhor a automacao saber agora.
      await record(db, {
        externalId, instanceId: instance.id, action: "issue", outcome: "no_credentials", ipHash,
        detail: `provider ${instance.provider} sem credencial utilizavel`,
      });
      return fail(ctx, "no_credentials");
    }

    // ---- modo monitor: so status, sem emitir token -------------------------
    if (checkOnly) {
      const adapter = getAdapter(instance.provider);
      let status = "disconnected";
      try {
        status = (await adapter.status({
          externalId: instance.external_id,
          baseUrl: instance.base_url,
          credentials: instance.credentials,
        })).status;
      } catch (e) {
        // Provider fora do ar na checagem: registra e devolve provider_error,
        // para o monitor distinguir "caiu" de "nao consegui checar".
        const err = toAppError(e);
        await record(db, {
          externalId, instanceId: instance.id, action: "status", outcome: "provider_error",
          ipHash, detail: err.detail,
        });
        return fail(ctx, "provider_error");
      }
      await record(db, {
        externalId, instanceId: instance.id, action: "status", outcome: "ok", ipHash,
        detail: `check_only status=${status}`,
      });
      return json(ctx, { status, label: instance.label });
    }

    // ---- emissao -----------------------------------------------------------
    // O token em claro existe apenas nesta funcao e na resposta. O banco recebe
    // so o hash (FR-15), e emitir revoga o anterior por unique(instance_id).
    const token = generateToken();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    await issueToken(db, instance.id, await hashToken(token), expiresAt);

    await record(db, {
      externalId, instanceId: instance.id, action: "issue", outcome: "ok", ipHash,
      detail: `ttl=${ttlMinutes}min`,
    });

    return json(ctx, {
      url: `${env.publicUrl}/${encodeURIComponent(instance.external_id)}?t=${encodeURIComponent(token)}`,
      token,
      expires_at: expiresAt.toISOString(),
      label: instance.label,
    });
  } catch (e) {
    const err: AppError = toAppError(e);
    await record(db, {
      externalId,
      action: "issue",
      outcome: err.code === "invalid_input" ? "invalid_input" : "config_error",
      ipHash,
      detail: `${ctx.requestId}: ${err.detail ?? err.code}`,
    });
    console.error(`[${ctx.requestId}] portal-issue-link:`, err.code, err.detail);
    return fail(ctx, err.code);
  }
});
