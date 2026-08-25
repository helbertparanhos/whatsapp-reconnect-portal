-- =============================================================================
-- 0001 — Schema do QR Pair Portal
--
-- Cria tudo que o portal precisa, do zero, em qualquer projeto Postgres/Supabase.
-- NAO altera, renomeia nem apaga nenhuma tabela pre-existente (ADR-004).
--
-- Implementa: 03-spec.md §Modelo de dados, §Politicas RLS
-- Atende: FR-11, FR-13, FR-14, FR-15, FR-16, FR-18
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

-- Discriminador de provider. E enum, nao text, de proposito: string vazia como
-- discriminador foi a causa do R-04, e enum torna esse estado irrepresentavel.
do $$ begin
  create type public.portal_provider as enum ('zapi', 'evolution', 'uazapi');
exception when duplicate_object then null; end $$;

-- Vocabulario normalizado de status. Os tres providers falam linguas diferentes
-- (booleano / open-close / connected-disconnected); o adapter traduz para cá.
do $$ begin
  create type public.portal_conn_status as enum ('connected', 'connecting', 'disconnected');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Funcoes auxiliares (schema privado, inacessivel ao cliente)
-- -----------------------------------------------------------------------------

create schema if not exists portal_private;
revoke all on schema portal_private from anon, authenticated;

-- Hash do token do link. O banco nunca guarda o token em claro (FR-15).
create or replace function portal_private.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Hash do IP com sal. IP e dado pessoal sob LGPD e nunca e gravado em claro (RNF-09).
-- O sal vem do Vault em runtime; jamais versionado.
create or replace function portal_private.hash_ip(p_ip text, p_salt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ip is null or p_ip = '' or p_salt is null then null
    else encode(extensions.digest(p_ip || p_salt, 'sha256'), 'hex')
  end;
$$;

create or replace function portal_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- portal_instances — as instancias que o portal sabe reconectar
-- -----------------------------------------------------------------------------

create table if not exists public.portal_instances (
  id          uuid primary key default gen_random_uuid(),

  -- Identificador da instancia NO PROVIDER. E o que aparece na URL do link.
  external_id text not null unique,

  -- Nome exibido ao cliente. Unico campo desta tabela que chega ao navegador (FR-01).
  label       text not null,

  -- Resolvido a partir daqui, nunca de variavel de ambiente global (FR-11, ADR-002).
  provider    public.portal_provider not null,

  -- Host do provider. Obrigatorio para evolution e uazapi; a z-api tem host fixo.
  base_url    text,

  -- Credenciais do provider. Nunca sai da Edge Function (FR-13).
  credentials jsonb not null default '{}'::jsonb,

  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Cada provider exige um conjunto diferente de credenciais. Validar aqui evita
  -- descobrir a falta so na hora em que o cliente abre o link.
  constraint portal_instances_credentials_ck check (
    case provider
      when 'zapi'      then credentials ? 'token'
      when 'evolution' then credentials ? 'api_key' and base_url is not null
      when 'uazapi'    then credentials ? 'token'   and base_url is not null
    end
  ),
  constraint portal_instances_external_id_ck check (length(trim(external_id)) > 0),
  constraint portal_instances_label_ck       check (length(trim(label)) > 0)
);

-- A emissao de link so olha instancias ativas.
create index if not exists portal_instances_active_idx
  on public.portal_instances (active) where active;

drop trigger if exists portal_instances_set_updated_at on public.portal_instances;
create trigger portal_instances_set_updated_at
  before update on public.portal_instances
  for each row execute function portal_private.set_updated_at();

-- -----------------------------------------------------------------------------
-- portal_link_tokens — o token que autoriza uma sessao de reconexao
-- -----------------------------------------------------------------------------

create table if not exists public.portal_link_tokens (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.portal_instances(id) on delete cascade,

  -- SHA-256 do token. NUNCA o token. Um dump desta tabela nao produz link valido (FR-15).
  token_hash   text not null unique,

  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),

  -- O token e multiuso dentro da janela (decisao registrada em ADR-003). Sem estes
  -- dois campos nao ha como distinguir "o cliente abriu duas vezes" de "estao varrendo".
  last_used_at timestamptz,
  use_count    integer not null default 0,

  -- Uma instancia tem no maximo UM token vivo: emitir revoga o anterior (FR-14).
  constraint portal_link_tokens_instance_uk unique (instance_id),
  constraint portal_link_tokens_expires_ck  check (expires_at > created_at)
);

create index if not exists portal_link_tokens_expires_idx
  on public.portal_link_tokens (expires_at);

-- -----------------------------------------------------------------------------
-- portal_access_log — auditoria e base do rate limit
-- -----------------------------------------------------------------------------

create table if not exists public.portal_access_log (
  id          bigint generated always as identity primary key,

  -- Texto puro: precisa ser registrado mesmo quando a instancia nao existe,
  -- que e justamente o caso de quem esta sondando.
  external_id text,
  instance_id uuid references public.portal_instances(id) on delete set null,

  action      text not null,
  outcome     text not null,

  -- SHA-256 de (IP + sal). Nunca IP em claro (RNF-09).
  ip_hash     text,

  -- Mensagem curta. Nunca token, credencial ou telefone.
  detail      text,
  created_at  timestamptz not null default now(),

  constraint portal_access_log_action_ck check (
    action in ('session', 'connect', 'status', 'issue')
  ),
  constraint portal_access_log_outcome_ck check (
    outcome in ('ok', 'invalid_token', 'expired', 'not_found', 'inactive',
                'no_credentials', 'provider_error', 'rate_limited', 'unauthorized',
                'config_error', 'invalid_input')
  )
);

-- Consulta do rate limit: so falhas interessam, por isso o indice e parcial (FR-16).
create index if not exists portal_access_log_ratelimit_idx
  on public.portal_access_log (ip_hash, created_at desc) where outcome <> 'ok';

-- Investigacao: "o link desta instancia foi aberto? quando? deu o que?" (FR-18)
create index if not exists portal_access_log_instance_idx
  on public.portal_access_log (instance_id, created_at desc);

-- Rotina de retencao (FR-21, migration 0002).
create index if not exists portal_access_log_created_idx
  on public.portal_access_log (created_at);

-- -----------------------------------------------------------------------------
-- RLS — negacao total
--
-- As tres tabelas guardam, respectivamente: credenciais de provider, hashes de
-- token de acesso, e log de auditoria. NENHUMA linha de NENHUMA delas pode ser
-- lida por anon ou authenticated. Todo acesso passa por Edge Function com
-- service_role, que por definicao ignora RLS.
--
-- A policy de negacao e explicita de proposito. Em Postgres, RLS habilitado sem
-- policy ja nega tudo — o efeito e identico. Ela existe para tornar a INTENCAO
-- legivel: tabela sem policy nenhuma e indistinguivel de esquecimento, que e o
-- sintoma classico de RLS mal feito. Ver ADR-005.
-- -----------------------------------------------------------------------------

alter table public.portal_instances   enable row level security;
alter table public.portal_link_tokens enable row level security;
alter table public.portal_access_log  enable row level security;

drop policy if exists "sem acesso publico" on public.portal_instances;
create policy "sem acesso publico" on public.portal_instances
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "sem acesso publico" on public.portal_link_tokens;
create policy "sem acesso publico" on public.portal_link_tokens
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "sem acesso publico" on public.portal_access_log;
create policy "sem acesso publico" on public.portal_access_log
  for all to anon, authenticated using (false) with check (false);

-- Cinto e suspensorio: alem da RLS, nenhum privilegio de tabela para o cliente.
revoke all on public.portal_instances,
              public.portal_link_tokens,
              public.portal_access_log
  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Documentacao no proprio schema
-- -----------------------------------------------------------------------------

comment on table public.portal_instances is
  'Instancias que o portal sabe reconectar. Somente service_role acessa.';
comment on column public.portal_instances.external_id is
  'Identificador da instancia no provider. Aparece na URL do link de reconexao.';
comment on column public.portal_instances.credentials is
  'Credenciais do provider. Nunca sai da Edge Function; nunca chega ao navegador.';
comment on table public.portal_link_tokens is
  'Token de acesso ao link. Somente o hash e armazenado. Um token vivo por instancia.';
comment on table public.portal_access_log is
  'Auditoria de acesso e base do rate limit. IP somente como hash com sal (LGPD).';
