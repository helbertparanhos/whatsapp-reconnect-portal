-- =============================================================================
-- 0004 — Colunas de monitoramento automatico
--
-- Suporte a um fluxo de automacao (ex: n8n) que monitora instancias e avisa um
-- grupo/canal quando caem. As colunas sao genericas — o "grupo" pode ser um
-- grupo de WhatsApp, um canal, um webhook: o portal nao decide, so guarda.
--
-- Atende: fluxo de reconexao proativa (fora do escopo do MVP, opt-in)
-- =============================================================================

alter table public.portal_instances
  add column if not exists notify_group text,
  add column if not exists notifier_external_id text,
  add column if not exists monitor boolean not null default false;

comment on column public.portal_instances.notify_group is
  'Grupo/canal (ex: id de grupo de WhatsApp) para onde vai o aviso de queda.';
comment on column public.portal_instances.notifier_external_id is
  'Identificador de quem envia o aviso. Deve ser membro do notify_group — a '
  'instancia caida nao consegue avisar sobre a propria queda.';
comment on column public.portal_instances.monitor is
  'Opt-in ao monitoramento automatico. Default false para que popular instancias '
  'nunca dispare avisos em massa sem intencao explicita.';

-- O fluxo pega so o que monitora: indice parcial.
create index if not exists portal_instances_monitor_idx
  on public.portal_instances (monitor) where monitor;
