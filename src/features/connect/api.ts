/**
 * As tres chamadas ao backend.
 *
 * UNICO lugar do front que monta requisicao. Componente que chama a rede direto
 * espalha tratamento de erro e torna impossivel garantir que toda falha vira
 * estado visivel.
 *
 * Regra dura aqui: **`res.ok` e checado antes de `res.json()`**. O codigo
 * anterior fazia `res.json()` direto, e uma resposta de erro com corpo nao-JSON
 * virava excecao generica sem causa (P-10).
 *
 * Atende: FR-01, FR-02, FR-05, FR-06, FR-07
 */

import { config, functionUrl } from "@/lib/config";

export type ConnStatus = "connected" | "connecting" | "disconnected";

export interface SessionResponse {
  label: string;
  status: ConnStatus;
  supports_pairing: boolean;
  poll_interval_ms: number;
  qr_ttl_ms: number;
}

export interface ConnectResponse {
  qrcode: string | null;
  paircode: string | null;
  status: ConnStatus;
  qr_ttl_ms: number;
}

export interface StatusResponse {
  status: ConnStatus;
}

/** Erro da API com o codigo do vocabulario fechado. */
export class ApiError extends Error {
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(code: string, retryAfterSeconds?: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface Credenciais {
  instance: string;
  token: string;
}

async function chamar<T>(
  nome: string,
  corpo: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(functionUrl(nome), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
      },
      body: JSON.stringify(corpo),
      signal,
    });
  } catch (e) {
    // Aborto e cancelamento nosso (aba escondida, desmontagem), nao falha.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network");
  }

  // Sempre antes do json(). Resposta de erro pode vir em HTML — do gateway, de
  // um proxy, de uma pagina de manutencao.
  const texto = await res.text();
  let dados: Record<string, unknown> = {};
  if (texto.trim().length > 0) {
    try {
      dados = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      // Corpo ilegivel: se o status ja indicava erro, propaga o erro; senao, e
      // resposta corrompida e tambem e erro.
      throw new ApiError(res.ok ? "network" : "provider_error");
    }
  }

  if (!res.ok) {
    const codigo = typeof dados.error === "string" ? dados.error : "provider_error";
    const retry =
      typeof dados.retry_after_seconds === "number" ? dados.retry_after_seconds : undefined;
    throw new ApiError(codigo, retry);
  }

  return dados as T;
}

export const abrirSessao = (c: Credenciais, signal?: AbortSignal) =>
  chamar<SessionResponse>("portal-session", { ...c }, signal);

export const gerarQrCode = (c: Credenciais, signal?: AbortSignal) =>
  chamar<ConnectResponse>("portal-connect", { ...c, method: "qrcode" }, signal);

export const gerarCodigoPareamento = (c: Credenciais, phone: string, signal?: AbortSignal) =>
  chamar<ConnectResponse>("portal-connect", { ...c, method: "paircode", phone }, signal);

export const consultarStatus = (c: Credenciais, signal?: AbortSignal) =>
  chamar<StatusResponse>("portal-status", { ...c }, signal);
