-- Teste de isolamento da RLS.
--
-- Nao le a policy para concluir que ela esta certa: TENTA ATRAVESSAR, com os
-- papeis reais do cliente (`anon` e `authenticated`), e falha se qualquer
-- tentativa passar.
--
-- Roda numa transacao que sempre desfaz: semeia dado de teste, ataca, e volta
-- ao estado anterior. Pode ser rodado contra producao sem deixar rastro.
--
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-rls-isolation.sql

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Semeia como service_role
-- ---------------------------------------------------------------------------
insert into public.portal_instances (external_id, label, provider, credentials)
values ('__RLS_TEST__', 'Instancia de teste', 'zapi',
        '{"token":"SEGREDO_QUE_NAO_PODE_VAZAR"}'::jsonb);

insert into public.portal_link_tokens (instance_id, token_hash, expires_at)
select id, '__hash_de_teste__', now() + interval '1 hour'
  from public.portal_instances where external_id = '__RLS_TEST__';

insert into public.portal_access_log (external_id, action, outcome, ip_hash)
values ('__RLS_TEST__', 'session', 'ok', '__hash_ip_de_teste__');

-- ---------------------------------------------------------------------------
-- Bateria 1 — o estado real: RLS + privilegio revogado
-- ---------------------------------------------------------------------------
do $$
declare n int; falhas text := '';
begin
  set local role anon;

  begin
    select count(*) into n from public.portal_instances;
    if n > 0 then falhas := falhas || format('anon leu %s instancia(s); ', n); end if;
  exception when insufficient_privilege then null;  -- negado: correto
  end;

  begin
    select count(*) into n from public.portal_link_tokens;
    if n > 0 then falhas := falhas || format('anon leu %s token(s); ', n); end if;
  exception when insufficient_privilege then null;
  end;

  begin
    select count(*) into n from public.portal_access_log;
    if n > 0 then falhas := falhas || format('anon leu %s log(s); ', n); end if;
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.portal_instances(external_id, label, provider, credentials)
      values('__RLS_ATTACK__', 'x', 'zapi', '{"token":"x"}');
    falhas := falhas || 'anon INSERIU instancia; ';
  exception when others then null;
  end;

  begin
    delete from public.portal_access_log;
    falhas := falhas || 'anon APAGOU auditoria; ';
  exception when others then null;
  end;

  begin
    perform public.portal_touch_token(gen_random_uuid());
    falhas := falhas || 'anon EXECUTOU portal_touch_token; ';
  exception when others then null;
  end;

  begin
    perform portal_private.hash_token('x');
    falhas := falhas || 'anon EXECUTOU portal_private.hash_token; ';
  exception when others then null;
  end;

  reset role;

  if falhas <> '' then
    raise exception 'BATERIA 1 FALHOU: %', falhas;
  end if;
  raise notice 'Bateria 1 OK: anon nao le, nao escreve, nao executa.';
end $$;

-- ---------------------------------------------------------------------------
-- Bateria 2 — a RLS sozinha aguenta?
--
-- Simula o cenario "alguem rodou GRANT por engano". Se a unica protecao fosse
-- o `revoke`, um GRANT descuidado abriria tudo — e a Bateria 1 continuaria
-- passando, porque ela nao distingue quem barrou.
-- ---------------------------------------------------------------------------
do $$
declare n int; falhas text := '';
begin
  grant select, insert, update, delete
    on public.portal_instances, public.portal_link_tokens, public.portal_access_log
    to anon, authenticated;

  set local role anon;
  select count(*) into n from public.portal_instances;
  if n > 0 then falhas := falhas || format('com GRANT, anon leu %s instancia(s); ', n); end if;
  select count(*) into n from public.portal_link_tokens;
  if n > 0 then falhas := falhas || format('com GRANT, anon leu %s token(s); ', n); end if;
  begin
    insert into public.portal_instances(external_id, label, provider, credentials)
      values('__RLS_ATTACK2__', 'x', 'zapi', '{"token":"x"}');
    falhas := falhas || 'com GRANT, anon INSERIU; ';
  exception when others then null;
  end;
  reset role;

  set local role authenticated;
  select count(*) into n from public.portal_instances;
  if n > 0 then falhas := falhas || format('com GRANT, authenticated leu %s instancia(s); ', n); end if;
  reset role;

  if falhas <> '' then
    raise exception 'BATERIA 2 FALHOU — a RLS nao segura sozinha: %', falhas;
  end if;
  raise notice 'Bateria 2 OK: mesmo com GRANT, a RLS devolve zero linhas.';
end $$;

-- ---------------------------------------------------------------------------
-- Desfaz tudo: dado de teste e os GRANTs da bateria 2.
-- ---------------------------------------------------------------------------
rollback;

\echo 'Isolamento verificado. Nenhuma alteracao persistida.'
