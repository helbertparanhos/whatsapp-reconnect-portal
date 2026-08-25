/**
 * portal-status — polling de conexao.
 *
 * Endpoint mais chamado do sistema. E ele que o teto de polling do FR-19
 * protege: sem teto, uma aba esquecida gera 720 invocacoes por hora (R-06).
 *
 * Revalida o token a cada chamada. Nao confia na validacao da abertura.
 *
 * Implementa: 03-spec.md §portal-status
 * Atende: FR-06, FR-09, FR-19
 */

import { loadEnv } from "../_shared/env.ts";
import { toAppError } from "../_shared/errors.ts";
import { preflight } from "../_shared/cors.ts";
import { json, fail, type ResponseContext } from "../_shared/http.ts";
import { createDb } from "../_shared/db.ts";
import { getAdapter } from "../_shared/adapters/registry.ts";
import { guard, auditOk, type GuardContext } from "../_shared/guard.ts";
import { record } from "../_shared/audit.ts";

declare const Deno: { serve(h: (req: Request) => Promise<Response> | Response): void };

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

  const db = createDb(env);
  const g: GuardContext = { req, env, db, ctx, action: "status" };

  try {
    const ok = await guard(g);
    const adapter = getAdapter(ok.instance.provider);

    try {
      const { status } = await adapter.status({
        externalId: ok.instance.external_id,
        baseUrl: ok.instance.base_url,
        credentials: ok.instance.credentials,
      });
      await auditOk(g, ok, `status=${status}`);
      return json(ctx, { status });
    } catch (e) {
      const err = toAppError(e);
      await record(db, {
        externalId: ok.externalId,
        instanceId: ok.instance.id,
        action: "status",
        outcome: "provider_error",
        ipHash: ok.ipHash,
        detail: err.detail,
      });
      console.error(`[${ctx.requestId}] portal-status:`, err.code, err.detail);
      return fail(ctx, err.code);
    }
  } catch (e) {
    const err = toAppError(e);
    console.error(`[${ctx.requestId}] portal-status:`, err.code, err.detail);
    return fail(
      ctx,
      err.code,
      err.code === "rate_limited" ? { retry_after_seconds: Number(err.detail) || 600 } : undefined,
    );
  }
});
