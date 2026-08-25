/**
 * Normalizacao das respostas dos providers.
 *
 * Aqui mora a traducao dos tres vocabularios para um so. Cada termo abaixo
 * corresponde a um provider especifico e foi verificado contra a documentacao
 * oficial e contra o comportamento real da API — nao inferido.
 *
 * Implementa: 03-spec.md §Normalizacao de status, §Normalizacao do QR
 * Atende: FR-12
 */

import type { ConnStatus } from "./types.ts";

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json =>
  typeof v === "object" && v !== null ? (v as Json) : {};

/**
 * Descasca envelopes comuns.
 *
 * Alguns gateways embrulham a resposta do provider em `data` ou `result`. Sem
 * isso, uma resposta legitima passaria despercebida e a instancia apareceria
 * como desconectada para sempre.
 */
const unwrap = (raw: unknown): Json => {
  const o = asObject(raw);
  if ("data" in o) return asObject(o.data);
  if ("result" in o) return asObject(o.result);
  return o;
};

/**
 * Traduz status para o vocabulario unico.
 *
 *   connected === true        -> Z-API (booleano puro)
 *   status === 'connected'    -> UAZAPI
 *   instance.state === 'open' -> Evolution
 *
 * O padrao e `disconnected`: na duvida, mostrar o QR e melhor que afirmar que
 * esta conectado e deixar a pessoa sem saida.
 */
export function normalizeStatus(raw: unknown): ConnStatus {
  const d = unwrap(raw);
  const instance = asObject(d.instance);

  if (d.connected === true || d.status === "connected" || instance.status === "connected" || instance.state === "open") {
    return "connected";
  }
  if (d.status === "connecting" || instance.status === "connecting" || instance.state === "connecting") {
    return "connecting";
  }
  return "disconnected";
}

/**
 * Converte o QR para data URI.
 *
 * Providers devolvem ora base64 puro, ora data URI pronta. O adapter sempre
 * entrega data URI para que o front nao precise adivinhar — era o que
 * `qrcodeBase64.startsWith("data:")` fazia espalhado pela tela antes.
 */
export function toDataUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0) return null;
  if (v.startsWith("data:")) return v;
  return `data:image/png;base64,${v}`;
}

/** Primeiro valor de string nao vazio entre os candidatos. */
export function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return null;
}

/** Extrai o QR das formas conhecidas: `value` (Z-API), `base64` (Evolution),
 *  `instance.qrcode` ou `qrcode` (UAZAPI). */
export function extractQrcode(raw: unknown): string | null {
  const d = unwrap(raw);
  const instance = asObject(d.instance);
  const qrcodeObj = asObject(d.qrcode);
  return toDataUri(
    firstString(d.value, d.base64, instance.qrcode, d.qrcode, qrcodeObj.base64, qrcodeObj.code),
  );
}

/** Extrai o codigo de pareamento das formas conhecidas. */
export function extractPaircode(raw: unknown): string | null {
  const d = unwrap(raw);
  const instance = asObject(d.instance);
  const qrcodeObj = asObject(d.qrcode);
  return firstString(
    d.pairingCode,
    instance.paircode,
    d.paircode,
    qrcodeObj.pairingCode,
    // `value` e `code` sao ambiguos: no endpoint de pareamento carregam o
    // codigo, no de QR carregam a imagem. Por isso vem por ultimo — e cada
    // adapter so chama esta funcao no contexto de pareamento, nunca no de QR.
    d.value,
    d.code,
  );
}
