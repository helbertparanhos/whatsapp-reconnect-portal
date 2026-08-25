/**
 * Cliente HTTP dos adapters.
 *
 * Concentra tres garantias que nao podem ficar por conta de cada adapter:
 *   1. timeout — provider pendurado nao pode segurar a Edge Function ate o teto
 *      da plataforma;
 *   2. erro do provider vira sempre `provider_error`, com a mensagem crua so no
 *      `detail` (que vai para o log, nunca para a resposta — SEC-10);
 *   3. resposta nao-JSON nao estoura como excecao generica (P-10).
 *
 * Atende: FR-07, FR-12
 */

import { AppError } from "../errors.ts";

const TIMEOUT_MS = 15_000;

export interface ProviderRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
}

export async function callProvider(req: ProviderRequest): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: {
        Accept: "application/json",
        ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...req.headers,
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const motivo = e instanceof Error && e.name === "AbortError" ? "timeout" : String(e);
    throw new AppError("provider_error", `falha de rede: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }

  const texto = await res.text();

  if (!res.ok) {
    // O corpo entra so no detalhe. Provider costuma devolver URL interna e
    // identificador de instancia na mensagem de erro.
    throw new AppError("provider_error", `HTTP ${res.status}: ${texto.slice(0, 300)}`);
  }

  if (texto.trim().length === 0) return {};

  try {
    return JSON.parse(texto);
  } catch {
    throw new AppError("provider_error", `resposta nao e JSON: ${texto.slice(0, 200)}`);
  }
}

/** Junta host e caminho sem gerar barra dupla nem perder a barra. */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Host obrigatorio para providers auto-hospedados. */
export function requireBaseUrl(baseUrl: string | null, provider: string): string {
  if (!baseUrl || baseUrl.trim().length === 0) {
    throw new AppError("config_error", `${provider}: base_url ausente`);
  }
  const b = baseUrl.trim();
  return b.startsWith("http") ? b : `https://${b}`;
}

export function requireCredential(
  credentials: Record<string, string>,
  key: string,
  provider: string,
): string {
  const v = credentials[key];
  if (!v || v.trim().length === 0) {
    throw new AppError("config_error", `${provider}: credencial '${key}' ausente`);
  }
  return v.trim();
}
