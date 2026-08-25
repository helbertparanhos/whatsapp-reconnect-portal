/**
 * Helpers de resposta HTTP.
 *
 * Concentram duas garantias que nao podem depender de disciplina de quem escreve
 * cada funcao:
 *   1. Toda resposta carrega os cabecalhos de CORS corretos (FR-17).
 *   2. Nenhuma resposta de erro vaza detalhe interno (SEC-10).
 *
 * Implementa: 03-spec.md §Contratos
 * Atende: FR-07, FR-17
 */

import { AppError, type ErrorCode, statusFor } from "./errors.ts";
import { corsHeaders } from "./cors.ts";

export interface ResponseContext {
  origin: string | null;
  allowedOrigins: string[];
  /** Identificador de correlacao — aparece nos 5xx e no log (RNF-07). */
  requestId: string;
}

const jsonHeaders = (ctx: ResponseContext) => ({
  ...corsHeaders(ctx.origin, ctx.allowedOrigins),
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
});

export function json(ctx: ResponseContext, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders(ctx) });
}

/**
 * Resposta de erro.
 *
 * Devolve apenas `error` (codigo do vocabulario) e, nos 5xx, `request_id` para
 * correlacionar com o log. O `detail` do AppError NAO entra na resposta — ele
 * costuma trazer a mensagem crua do provider, com URL e identificador interno.
 *
 * `extra` existe para campos previstos no contrato, como `retry_after_seconds`.
 * Nunca use para explicar a causa tecnica.
 */
export function fail(
  ctx: ResponseContext,
  code: ErrorCode,
  extra?: Record<string, unknown>,
): Response {
  const status = statusFor(code);
  const body: Record<string, unknown> = { error: code, ...extra };
  if (status >= 500) body.request_id = ctx.requestId;
  return json(ctx, body, status);
}

export const failFrom = (ctx: ResponseContext, e: AppError, extra?: Record<string, unknown>) =>
  fail(ctx, e.code, extra);

/** Le o corpo JSON, tratando corpo vazio ou malformado como entrada invalida. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null) {
      throw new AppError("invalid_input", "corpo nao e um objeto");
    }
    return body as T;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("invalid_input", "corpo nao e JSON valido");
  }
}

/**
 * Extrai o IP do cliente.
 *
 * Atras do gateway da plataforma, `x-forwarded-for` traz a cadeia completa e o
 * primeiro elemento e o cliente. Usado apenas para gerar hash (RNF-09).
 */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

/** Campo de texto obrigatorio, com trim e limite de tamanho. */
export function requiredString(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string") throw new AppError("invalid_input", `${field} ausente`);
  const s = v.trim();
  if (s.length === 0) throw new AppError("invalid_input", `${field} vazio`);
  if (s.length > max) throw new AppError("invalid_input", `${field} longo demais`);
  return s;
}
