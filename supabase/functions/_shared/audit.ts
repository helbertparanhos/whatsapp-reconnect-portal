/**
 * Auditoria de acesso.
 *
 * Responde as perguntas da Bia: o link foi aberto? quando? qual foi o desfecho?
 * (FR-18). Tambem alimenta o rate limit (FR-16) — uma tabela, dois propositos,
 * conforme ADR-005.
 *
 * Regra dura: **falha ao registrar nunca derruba a requisicao do usuario.** Log
 * indisponivel nao pode impedir alguem de reconectar o WhatsApp.
 *
 * Implementa: 03-spec.md §Modelo de dados
 * Atende: FR-16, FR-18, RNF-09
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export type AuditAction = "session" | "connect" | "status" | "issue";

export type AuditOutcome =
  | "ok"
  | "invalid_token"
  | "expired"
  | "not_found"
  | "inactive"
  | "no_credentials"
  | "provider_error"
  | "rate_limited"
  | "unauthorized"
  | "config_error"
  | "invalid_input";

export interface AuditEntry {
  externalId: string | null;
  instanceId?: string | null;
  action: AuditAction;
  outcome: AuditOutcome;
  ipHash: string | null;
  /** Mensagem curta. NUNCA token, credencial ou telefone. */
  detail?: string | null;
}

/** Tamanho maximo do detalhe. Mensagem de provider pode vir enorme e nao ha
 *  motivo para guardar tudo. */
const MAX_DETAIL = 500;

export async function record(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await db.from("portal_access_log").insert({
      external_id: entry.externalId,
      instance_id: entry.instanceId ?? null,
      action: entry.action,
      outcome: entry.outcome,
      ip_hash: entry.ipHash,
      detail: entry.detail ? entry.detail.slice(0, MAX_DETAIL) : null,
    });
  } catch (e) {
    // Deliberadamente engolido — mas NAO em silencio. A regra do projeto proibe
    // `catch` vazio; aqui o erro vai para o log da plataforma, enquanto a
    // requisicao do usuario segue.
    console.error("audit: falha ao registrar", e instanceof Error ? e.message : String(e));
  }
}
