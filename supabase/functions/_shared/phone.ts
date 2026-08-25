/**
 * Validacao de telefone para o codigo de pareamento.
 *
 * Roda nos DOIS lados: no front, para dar retorno imediato sem gastar uma
 * chamada; e aqui, porque validacao de cliente nao e validacao.
 *
 * O telefone NUNCA e persistido — nem em tabela, nem em log de auditoria
 * (RNF-10). Ele e repassado ao provider e descartado.
 *
 * Atende: FR-05, RNF-10
 */

/**
 * Faixa de 10 a 15 digitos.
 *
 * O teto de 15 e o maximo do padrao E.164. O piso de 10 cobre o numero
 * brasileiro sem o DDI (DDD + 8 digitos), que e o erro mais comum: a pessoa
 * digita o proprio numero como o ve na agenda, sem o 55.
 */
const MIN = 10;
const MAX = 15;

export type PhoneCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "not_numeric" };

export function checkPhone(input: unknown): PhoneCheck {
  if (typeof input !== "string") return { ok: false, reason: "empty" };

  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };

  // Aceita a formatacao que a pessoa costuma digitar — +55 (11) 99999-9999 —
  // e recusa qualquer outro caractere, para nao deixar passar letra.
  if (/[^\d\s()+\-.]/.test(trimmed)) return { ok: false, reason: "not_numeric" };

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return { ok: false, reason: "empty" };
  if (digits.length < MIN) return { ok: false, reason: "too_short" };
  if (digits.length > MAX) return { ok: false, reason: "too_long" };

  return { ok: true, value: digits };
}

/** Somente digitos, ou null. Usado onde o motivo da recusa nao importa. */
export const normalizePhone = (input: unknown): string | null => {
  const r = checkPhone(input);
  return r.ok ? r.value : null;
};
