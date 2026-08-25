/**
 * CORS por lista explicita de origens.
 *
 * O sistema anterior respondia `Access-Control-Allow-Origin: *` com
 * `verify_jwt = false`, ou seja, qualquer pagina de qualquer dominio chamava os
 * endpoints (P-02). Aqui a lista vem de configuracao e o padrao NAO e curinga.
 *
 * Implementa: 03-spec.md §Contratos
 * Atende: FR-17, SEC-11
 */

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-portal-secret";
const ALLOWED_METHODS = "POST, OPTIONS";

/** Le a lista de origens de uma string separada por virgula. */
export function parseOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "")) // tolera barra final na configuracao
    .filter((o) => o.length > 0);
}

/**
 * Decide os cabecalhos de CORS para uma requisicao.
 *
 * Origem nao listada recebe resposta SEM cabecalho de liberacao — o navegador
 * bloqueia. Nao respondemos com erro: quem esta sondando nao ganha confirmacao
 * de que a origem importa.
 *
 * `allowed` vazio (configuracao ausente) nega tudo. Falhar fechado e proposital:
 * esquecer de configurar nao pode virar liberacao geral.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (!origin) return base;

  const normalized = origin.replace(/\/+$/, "");
  if (allowed.includes(normalized)) {
    return { ...base, "Access-Control-Allow-Origin": normalized };
  }
  return base;
}

export const isOriginAllowed = (origin: string | null, allowed: string[]): boolean =>
  origin !== null && allowed.includes(origin.replace(/\/+$/, ""));

/** Resposta ao preflight. Sempre 204, com ou sem liberacao. */
export function preflight(origin: string | null, allowed: string[]): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
}
