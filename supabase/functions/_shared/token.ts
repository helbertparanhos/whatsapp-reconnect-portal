/**
 * Geracao, hash e comparacao de token de link.
 *
 * O banco guarda apenas o hash. Um dump da tabela nao produz nenhum link valido
 * (FR-15). A validacao contra o banco vive em `repo.ts`, porque precisa casar
 * hash e identificador na MESMA consulta (SEC-02) — aqui fica so a parte pura,
 * que o vitest testa sem banco nem plataforma.
 *
 * Implementa: 03-spec.md §Validacao do token
 * Atende: FR-15, SEC-01, SEC-02
 */

/**
 * Alfabeto sem caracteres ambiguos.
 *
 * Fora: I, l, 1, O, 0. O token vai num link que a pessoa pode acabar digitando
 * ou lendo em voz alta ao telefone com o suporte, e confundir I com l gera um
 * "o link nao funciona" que ninguem consegue diagnosticar.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 32 caracteres sobre 56 simbolos = ~185 bits. Acima dos 128 exigidos (FR-15). */
const TOKEN_LENGTH = 32;

/**
 * Gera um token com entropia criptografica.
 *
 * Usa rejeicao de amostra em vez de `% ALPHABET.length`: o modulo simples
 * enviesa os primeiros simbolos do alfabeto quando 256 nao e multiplo do
 * tamanho, e reduz a entropia real abaixo do declarado.
 */
export function generateToken(length = TOKEN_LENGTH): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out: string[] = [];
  const buf = new Uint8Array(length * 2);

  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (out.length >= length) break;
      if (b < max) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}

/** SHA-256 em hexadecimal. Mesmo algoritmo de `portal_private.hash_token`. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 de (ip + sal). Sem sal nao ha hash — devolve null (RNF-09). */
export async function hashIp(ip: string | null, salt: string): Promise<string | null> {
  if (!ip || !salt) return null;
  const data = new TextEncoder().encode(ip + salt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparacao em tempo constante.
 *
 * Usada no segredo de emissao (FR-14). Comparacao com `===` vaza, pelo tempo de
 * resposta, quantos caracteres iniciais estao certos — o que permite descobrir
 * o segredo byte a byte.
 *
 * Compara sempre o mesmo numero de posicoes, independentemente do tamanho das
 * entradas, para nao vazar o comprimento tambem.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Validade do token: padrao 2h, teto 2h (RNF-05). */
export const MAX_TTL_MINUTES = 120;

export function resolveTtlMinutes(requested?: unknown): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) return MAX_TTL_MINUTES;
  const n = Math.floor(requested);
  if (n < 1) return 1;
  return Math.min(n, MAX_TTL_MINUTES);
}
