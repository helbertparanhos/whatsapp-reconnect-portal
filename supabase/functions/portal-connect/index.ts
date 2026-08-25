/**
 * portal-connect — gera QR Code ou codigo de pareamento.
 *
 * Resolve o provider a partir da instancia e delega ao adapter. A tela nao sabe
 * qual provider esta por tras (FR-11, FR-12).
 *
 * Implementa: 03-spec.md §portal-connect
 * Atende: FR-02, FR-03, FR-04, FR-05, FR-12
 */

import { loadEnv } from "../_shared/env.ts";
import { AppError, toAppError } from "../_shared/errors.ts";
import { preflight } from "../_shared/cors.ts";
import { json, fail, type ResponseContext } from "../_shared/http.ts";
import { createDb } from "../_shared/db.ts";
import { getAdapter } from "../_shared/adapters/registry.ts";
import { guard, auditOk, type GuardContext } from "../_shared/guard.ts";
import { record } from "../_shared/audit.ts";
import { checkPhone } from "../_shared/phone.ts";

declare const Deno: { serve(h: (req: Request) => Promise<Response> | Response): void };

const QR_TTL_MS = 20_000;

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
  const g: GuardContext = { req, env, db, ctx, action: "connect" };

  try {
    const ok = await guard(g);
    const adapter = getAdapter(ok.instance.provider);
    const method = ok.body.method === "paircode" ? "paircode" : "qrcode";

    // ---- pareamento: validar ANTES de gastar uma chamada ao provider -------
    let phone: string | undefined;
    if (method === "paircode") {
      if (!adapter.supportsPairing) throw new AppError("pairing_unsupported");

      const check = checkPhone(ok.body.phone);
      if (!check.ok) {
        // O motivo vai para o log, nunca para a resposta — e o numero em si
        // jamais e registrado (RNF-10).
        await record(db, {
          externalId: ok.externalId,
          instanceId: ok.instance.id,
          action: "connect",
          outcome: "invalid_input",
          ipHash: ok.ipHash,
          detail: `telefone invalido: ${check.reason}`,
        });
        return fail(ctx, "invalid_phone");
      }
      phone = check.value;
    }

    // ---- provider ----------------------------------------------------------
    try {
      const result = await adapter.connect(
        {
          externalId: ok.instance.external_id,
          baseUrl: ok.instance.base_url,
          credentials: ok.instance.credentials,
        },
        phone ? { phone } : {},
      );

      // Ja conectado nao e erro: e a melhor noticia possivel. A tela troca para
      // sucesso em vez de mostrar um QR que o provider recusaria (FR-09).
      if (result.status === "connected") {
        await auditOk(g, ok, "ja conectado");
        return json(ctx, { qrcode: null, paircode: null, status: "connected", qr_ttl_ms: QR_TTL_MS });
      }

      await auditOk(g, ok, `method=${method}`);
      return json(ctx, {
        qrcode: result.qrcode,
        paircode: result.paircode,
        status: result.status,
        qr_ttl_ms: QR_TTL_MS,
      });
    } catch (e) {
      const err = toAppError(e);
      await record(db, {
        externalId: ok.externalId,
        instanceId: ok.instance.id,
        action: "connect",
        outcome: err.code === "config_error" ? "config_error" : "provider_error",
        ipHash: ok.ipHash,
        detail: err.detail,
      });
      console.error(`[${ctx.requestId}] portal-connect:`, err.code, err.detail);
      return fail(ctx, err.code);
    }
  } catch (e) {
    const err = toAppError(e);
    console.error(`[${ctx.requestId}] portal-connect:`, err.code, err.detail);
    return fail(
      ctx,
      err.code,
      err.code === "rate_limited" ? { retry_after_seconds: Number(err.detail) || 600 } : undefined,
    );
  }
});
