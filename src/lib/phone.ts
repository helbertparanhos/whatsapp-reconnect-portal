/**
 * Validacao de telefone no front.
 *
 * Reexporta a MESMA regra usada pelo backend. Duas implementacoes da mesma
 * validacao divergem com o tempo, e o sintoma e sempre o mesmo: o campo aceita
 * um numero que a funcao recusa, e a pessoa nao entende por que.
 *
 * A validacao do front serve para dar retorno imediato sem gastar uma chamada.
 * Ela NAO substitui a do servidor — validacao de cliente nao e validacao.
 *
 * Atende: FR-05
 */

export { checkPhone, normalizePhone, type PhoneCheck } from "../../supabase/functions/_shared/phone";

/** Mascara de exibicao para numero brasileiro. Nao altera o valor enviado. */
export function formatarTelefone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 9) return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9, 13)}`;
}

/** Motivo da recusa em portugues, para exibir sob o campo. */
export const motivoEmPortugues: Record<string, string> = {
  empty: "Digite o numero do WhatsApp.",
  too_short: "Faltam digitos. Inclua o codigo do pais e o DDD — ex: 55 11 99999-9999.",
  too_long: "Numero longo demais. Confira os digitos.",
  not_numeric: "Use apenas numeros.",
};
