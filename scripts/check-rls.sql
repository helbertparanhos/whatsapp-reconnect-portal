-- Verificacao de RLS das tabelas do portal.
--
-- Roda contra qualquer banco onde as migrations foram aplicadas. Falha se
-- alguma tabela `portal_*` estiver sem RLS ou sem policy.
--
-- A regra "toda tabela tem policy" so pode ser exigida sem excecao porque as
-- tabelas deste projeto usam policy explicita de negacao (ADR-005). Se elas
-- apenas tivessem RLS ligada sem policy, esta verificacao precisaria de uma
-- lista de excecoes — e lista de excecoes e onde furo de seguranca se esconde.
--
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-rls.sql

\set ON_ERROR_STOP on

do $$
declare
  r record;
  problemas text := '';
  total int := 0;
begin
  for r in
    select c.relname as tabela,
           c.relrowsecurity as rls_ligada,
           (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname like 'portal\_%'
  loop
    total := total + 1;

    if not r.rls_ligada then
      problemas := problemas || format('  - %s: RLS DESLIGADA%s', r.tabela, chr(10));
    elsif r.policies = 0 then
      problemas := problemas || format('  - %s: RLS ligada mas SEM POLICY%s', r.tabela, chr(10));
    end if;
  end loop;

  if total = 0 then
    raise exception 'Nenhuma tabela portal_* encontrada. As migrations foram aplicadas?';
  end if;

  if problemas <> '' then
    raise exception 'RLS incorreta em % de % tabela(s):%%s', total, total, chr(10), problemas;
  end if;

  raise notice 'OK: % tabela(s) portal_* com RLS ligada e policy definida.', total;
end $$;

-- Nenhuma view em public sem security_invoker: sem isso a view executa como
-- dono e atravessa a RLS das tabelas de baixo.
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'portal\_%'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker'), 'false') <> 'true'
  loop
    raise exception 'View %.% sem security_invoker=true', 'public', v.relname;
  end loop;
  raise notice 'OK: nenhuma view portal_* sem security_invoker.';
end $$;
