/**
 * Vocabulario fechado de erro.
 *
 * O front mapeia cada codigo para uma mensagem em portugues (FR-07). Codigo fora
 * desta lista e bug: o front cai numa mensagem generica, mas com acao — nunca
 * tela em branco.
 *
 * Nenhuma mensagem daqui chega ao usuario final. Elas existem para log e para
 * quem integra; o texto que a Sandra le mora em `src/lib/errors.ts`.
 *
 * Implementa: 03-spec.md §Codigos de erro
 * Atende: FR-07, SEC-10
 */

export const ERROR_CODES = [
  "invalid_token",
  "rate_limited",
  "invalid_phone",
  "invalid_input",
  "pairing_unsupported",
  "already_connected",
  "provider_error",
  "config_error",
  "unauthorized",
  "not_found",
  "inactive",
  "no_credentials",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Status HTTP de cada codigo. Fonte unica — evita divergencia entre funcoes. */
const STATUS: Record<ErrorCode, number> = {
  invalid_token: 401,
  unauthorized: 401,
  rate_limited: 429,
  invalid_phone: 400,
  invalid_input: 400,
  pairing_unsupported: 400,
  already_connected: 409,
  inactive: 409,
  no_credentials: 409,
  not_found: 404,
  provider_error: 502,
  config_error: 500,
  internal: 500,
};

export const statusFor = (code: ErrorCode): number => STATUS[code] ?? 500;

/**
 * Erro de aplicacao com codigo do vocabulario.
 *
 * `detail` NUNCA vai para a resposta. Ele existe para o log — e por isso pode
 * conter a mensagem crua do provider, que costuma trazer URL e identificador
 * interno (SEC-10).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail?: string;

  constructor(code: ErrorCode, detail?: string) {
    // A mensagem carrega o detalhe porque e o que aparece em stack trace e no
    // log da plataforma, onde ele e justamente o que se quer ler. A RESPOSTA
    // nunca usa `message` — `fail()` envia apenas `code` (SEC-10).
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
  }
}

export const isAppError = (e: unknown): e is AppError =>
  e instanceof AppError || (typeof e === "object" && e !== null && "code" in e && "detail" in e);

/**
 * Traduz qualquer excecao para um par (codigo, detalhe) seguro.
 *
 * Excecao desconhecida vira `internal` e a mensagem original vai apenas para o
 * detalhe, que fica no log. Nunca deixamos um stack trace escapar na resposta.
 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Error) return new AppError("internal", e.message);
  return new AppError("internal", String(e));
}
