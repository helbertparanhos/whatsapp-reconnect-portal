-- =============================================================================
-- 0002 — Retencao de dados do QR Pair Portal
--
-- Corrige o R-09: no sistema anterior o agendamento existia apenas no painel,
-- fora do repositorio. Quem clonasse o projeto nao o reproduzia, e ninguem
-- conseguia saber, lendo o codigo, que rotinas existiam.
--
-- Implementa: 03-spec.md §Retencao
-- Atende: FR-21 (LGPD art. 16 — retencao implementada, nao apenas declarada)
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- -----------------------------------------------------------------------------
-- Auditoria: 90 dias
--
-- O log guarda hash de IP, que e dado pessoal pseudonimizado. A retencao
-- declarada no PRD e no README precisa existir como rotina, nao como intencao.
-- -----------------------------------------------------------------------------

select cron.unschedule('portal-purge-access-log')
  where exists (select 1 from cron.job where jobname = 'portal-purge-access-log');

select cron.schedule(
  'portal-purge-access-log',
  '17 3 * * *',   -- 03h17: fora do horario de pico e fora dos minutos redondos,
                  -- onde toda rotina do mundo se acumula
  $$ delete from public.portal_access_log where created_at < now() - interval '90 days' $$
);

-- -----------------------------------------------------------------------------
-- Tokens expirados: 1 dia de carencia
--
-- A carencia existe para investigacao: se um cliente relata "o link nao
-- funcionou", da para verificar que o token existiu e quando venceu. Passado
-- isso, nao ha motivo para guardar nem o hash.
-- -----------------------------------------------------------------------------

select cron.unschedule('portal-purge-expired-tokens')
  where exists (select 1 from cron.job where jobname = 'portal-purge-expired-tokens');

select cron.schedule(
  'portal-purge-expired-tokens',
  '*/30 * * * *',
  $$ delete from public.portal_link_tokens where expires_at < now() - interval '1 day' $$
);
