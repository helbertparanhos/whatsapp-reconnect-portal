/**
 * portal-session — abre a pagina.
 *
 * Valida o token, consulta o status real no provider e devolve o contexto
 * minimo para a tela: o nome da instancia e o que fazer em seguida.
 *
 * Devolve `label` e NADA MAIS que identifique a instancia. Sem provider, sem
 * host, sem credencial, sem id interno (FR-13).
 *
 * Nao existe 404 neste contrato: instancia inexistente devolve o mesmo 401 de
 * token invalido, senao da para enumerar instancias (SEC-03).
 *
 * Implementa: 03-spec.md §portal-session
 * Atende: FR-01, FR-08, FR-09
 */

import { loadEnv } from "../_shared/env.ts";
import { toAppError } from "../_shared/errors.ts";
import { preflight } from "../_shared/cors.ts";
import { json, fail, type ResponseContext } from "../_shared/http.ts";
import { createDb } from "../_shared/db.ts";
import { getAdapter } from "../_shared/adapters/registry.ts";
import { guard, auditOk, type GuardContext } from "../_shared/guard.ts";

declare const Deno: { serve(h: (req: Request) => Promise<Response> | Response): void };

/** Parametros de comportamento da tela, servidos pelo backend para que ajustar
 *  o ritmo do polling nao exija novo build do front (FR-19). */
const POLL_INTERVAL_MS = 5_000;
const QR_TTL_MS = 20_000; // o WhatsApp invalida o QR a cada 20s

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
  const g: GuardContext = { req, env, db, ctx, action: "session" };

  try {
    const ok = await guard(g);
    const adapter = getAdapter(ok.instance.provider);

    // O status e consultado ANTES de qualquer QR. E o que permite descobrir que
    // a instancia ja esta conectada e poupar a pessoa de um QR inutil (FR-09).
    let status: string;
    try {
      status = (await adapter.status({
        externalId: ok.instance.external_id,
        baseUrl: ok.instance.base_url,
        credentials: ok.instance.credentials,
      })).status;
    } catch (e) {
      // Provider fora do ar na abertura nao trava a pagina: seguimos para o
      // fluxo normal de QR, e o erro aparece la se persistir (FR-09).
      const err = toAppError(e);
      console.error(`[${ctx.requestId}] portal-session: status indisponivel:`, err.detail);
      status = "disconnected";
    }

    await auditOk(g, ok, `status=${status}`);

    return json(ctx, {
      label: ok.instance.label,
      status,
      supports_pairing: adapter.supportsPairing,
      poll_interval_ms: POLL_INTERVAL_MS,
      qr_ttl_ms: QR_TTL_MS,
    });
  } catch (e) {
    const err = toAppError(e);
    console.error(`[${ctx.requestId}] portal-session:`, err.code, err.detail);
    return fail(
      ctx,
      err.code,
      err.code === "rate_limited" ? { retry_after_seconds: Number(err.detail) || 600 } : undefined,
    );
  }
});
