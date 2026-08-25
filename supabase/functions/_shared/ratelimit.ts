/**
 * Rate limit derivado da tabela de auditoria.
 *
 * Sem infraestrutura adicional: a tabela de auditoria ja e obrigatoria pelo
 * FR-18, e um indice parcial resolve a consulta. Ver ADR-005 para por que nao
 * ha Redis nem proxy aqui.
 *
 * Este modulo contem apenas a DECISAO. A contagem vem de fora, por parametro,
 * para que a regra seja testavel sem banco.
 *
 * Implementa: 03-spec.md §Rate limiting
 * Atende: FR-16, SEC-01, SEC-07
 */

export const WINDOW_MINUTES = 10;

/**
 * Falhas por origem. Dez tentativas com token invalido em dez minutos e muito
 * acima de qualquer erro honesto — quem digita errado nao chega perto disso.
 */
export const MAX_FAILURES_PER_IP = 10;

/**
 * Requisicoes por instancia. Uma sessao legitima consome cerca de 60 chamadas de
 * polling (5 min a cada 5s) mais as renovacoes de QR. Duzentas deixa folga de
 * mais de 3x sem abrir espaco para varredura.
 */
export const MAX_REQUESTS_PER_INSTANCE = 200;

export interface RateLimitCounts {
  /** Falhas desta origem na janela. */
  ipFailures: number;
  /** Requisicoes desta instancia na janela, de qualquer desfecho. */
  instanceRequests: number;
}

export interface RateLimitVerdict {
  limited: boolean;
  retryAfterSeconds: number;
  reason?: "ip_failures" | "instance_requests";
}

export function evaluate(counts: RateLimitCounts): RateLimitVerdict {
  const retryAfterSeconds = WINDOW_MINUTES * 60;

  if (counts.ipFailures >= MAX_FAILURES_PER_IP) {
    return { limited: true, retryAfterSeconds, reason: "ip_failures" };
  }
  if (counts.instanceRequests >= MAX_REQUESTS_PER_INSTANCE) {
    return { limited: true, retryAfterSeconds, reason: "instance_requests" };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Instante de inicio da janela, para a consulta de contagem. */
export const windowStart = (now: Date = new Date()): Date =>
  new Date(now.getTime() - WINDOW_MINUTES * 60_000);
