/**
 * Guarda comum das tres funcoes do portal.
 *
 * As tres fazem exatamente a mesma sequencia antes de qualquer trabalho util:
 * CORS, rate limit, validacao do token e auditoria. Triplicar isso seria a
 * receita para uma delas ficar para tras numa correcao de seguranca — que e
 * como o R-01 sobreviveu tanto tempo em um lugar so.
 *
 * Regra que esta funcao existe para garantir: **toda chamada revalida o token.**
 * Nenhuma confia na validacao feita na abertura da pagina.
 *
 * Implementa: 03-spec.md §Validacao do token, §Rate limiting
 * Atende: FR-01, FR-08, FR-16, FR-17, FR-18 · Mitiga: SEC-01, SEC-02, SEC-03
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

import { AppError } from "./errors.ts";
import { isOriginAllowed } from "./cors.ts";
import { clientIp, readJson, requiredString, type ResponseContext } from "./http.ts";
import { hashIp } from "./token.ts";
import { validateToken, rateLimitCounts, type InstanceRow } from "./db.ts";
import { evaluate } from "./ratelimit.ts";
import { record, type AuditAction } from "./audit.ts";
import type { PortalEnv } from "./env.ts";

export interface GuardOk {
  instance: InstanceRow;
  externalId: string;
  ipHash: string | null;
  body: Record<string, unknown>;
}

export interface GuardContext {
  req: Request;
  env: PortalEnv;
  db: SupabaseClient;
  ctx: ResponseContext;
  action: AuditAction;
}

/**
 * Executa a guarda completa.
 *
 * Lanca `AppError` em qualquer recusa, ja tendo registrado a auditoria. Quem
 * chama so precisa converter para resposta.
 *
 * `retryAfterSeconds` viaja no `detail` do erro de rate limit porque o contrato
 * prevê esse campo na resposta 429.
 */
export async function guard(g: GuardContext): Promise<GuardOk> {
  const { req, env, db, ctx, action } = g;

  // Origem: chamada de navegador precisa estar na lista. Requisicao sem Origin
  // (servidor a servidor) segue — a barreira dela e o token.
  if (ctx.origin && !isOriginAllowed(ctx.origin, env.allowedOrigins)) {
    throw new AppError("unauthorized", `origem nao permitida: ${ctx.origin}`);
  }

  const ipHash = await hashIp(clientIp(req), env.ipSalt);
  const body = await readJson(req);

  // `instance` e lido antes do token porque o rate limit por instancia precisa
  // dele mesmo quando o token esta errado — e justamente o caso da varredura.
  const externalId = requiredString(body.instance, "instance");

  const fail = async (outcome: Parameters<typeof record>[1]["outcome"], detail?: string) => {
    await record(db, { externalId, action, outcome, ipHash, detail });
  };

  // ---- rate limit --------------------------------------------------------
  const verdict = evaluate(await rateLimitCounts(db, ipHash, externalId));
  if (verdict.limited) {
    await fail("rate_limited", verdict.reason);
    throw new AppError("rate_limited", String(verdict.retryAfterSeconds));
  }

  // ---- token -------------------------------------------------------------
  const token = requiredString(body.token, "token", 128);
  const instance = await validateToken(db, externalId, token);

  if (!instance) {
    // Token errado, expirado, instancia inexistente e instancia inativa
    // devolvem a MESMA resposta. Diferenciar permitiria enumerar instancias
    // (SEC-03). O log guarda o que de fato aconteceu.
    await fail("invalid_token");
    throw new AppError("invalid_token");
  }

  return { instance, externalId, ipHash, body };
}

/** Registra o desfecho de sucesso. Separado da guarda porque so quem executou o
 *  trabalho sabe se ele terminou bem. */
export const auditOk = (g: GuardContext, ok: GuardOk, detail?: string) =>
  record(g.db, {
    externalId: ok.externalId,
    instanceId: ok.instance.id,
    action: g.action,
    outcome: "ok",
    ipHash: ok.ipHash,
    detail,
  });
