# Spec Técnica — QR Pair Portal
> Fase 3 · 2026-08-24 · versão 1.0
> Implementa: `03-prd.md`

## Stack

| Camada | Escolha | Versão | ADR |
|---|---|---|---|
| Front | Vite + React (SPA estática) | 5.x / 18.x | ADR-006 |
| Linguagem | TypeScript strict | 5.8 | — |
| Estilo | Tailwind + shadcn/ui | 3.4 | — |
| Backend | Supabase Edge Functions (Deno) | — | — |
| Banco | Postgres (Supabase), plano Pro | 15 | ADR-001 |
| Deploy | Easypanel (Docker, estático) | — | — |

---

## Arquitetura

```
  Sandra (celular)
      │  GET /{instance}?t={token}
      ▼
  SPA estática (Easypanel/nginx)          ← só HTML/CSS/JS. Zero segredo.
      │  POST, header apikey = chave publicável
      ▼
  Supabase Edge Functions (Deno)          ← verify_jwt = false; autorização é o token do link
      │  portal-session · portal-connect · portal-status
      │  portal-issue-link  ← protegida por x-portal-secret
      │
      ├─── service_role ──► Postgres
      │                       ├── portal_instances    (RLS: negação total)
      │                       ├── portal_link_tokens  (RLS: negação total)
      │                       └── portal_access_log   (RLS: negação total)
      │
      └─── adapter ────────► Z-API  ·  Evolution API  ·  UAZAPI

  Automação externa (n8n)
      │  detecta queda → POST portal-issue-link (x-portal-secret)
      │  recebe URL → envia ao cliente
      ▼
  Sincroniza instâncias ──► portal_instances
```

### Decisões estruturais

- **Toda credencial de provider vive no banco, lida só por Edge Function com `service_role`.** O
  navegador jamais recebe host, chave ou identificador interno. (FR-13)
- **A autorização não é sessão, é o token do link.** Não existe login, cookie nem JWT de usuário.
  Por isso as funções rodam com `verify_jwt = false` — o JWT não teria o que verificar.
- **Toda função revalida o token.** Nenhuma confia na validação feita na abertura da página.
- **O adapter é a única parte que conhece provider.** Função e front falam só o vocabulário
  normalizado. Adicionar provider = adicionar um arquivo e registrá-lo.
- **A SPA nunca fala direto com o Postgres.** A chave publicável serve só para atravessar o gateway
  das funções; ela não dá acesso a nenhuma tabela, porque nenhuma tabela tem policy de leitura.
- **Nenhuma tabela pré-existente é criada, alterada ou renomeada.** (ADR-004)
- **Nada de dado pessoal em claro.** IP só como hash com sal; telefone nunca persistido. (RNF-09/10)

---

## Modelo de dados

Prefixo `portal_` em tudo: identifica o domínio, evita colisão em projeto compartilhado e não
carrega nome de operação nenhuma.

```sql
create type portal_provider as enum ('zapi', 'evolution', 'uazapi');
create type portal_conn_status as enum ('connected', 'connecting', 'disconnected');
```

### Tabela `portal_instances`

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK interna |
| `external_id` | `text` | não | — | Identificador da instância **no provider**. É o que vai na URL. UNIQUE |
| `label` | `text` | não | — | Nome exibido ao cliente. Único dado que sai para o navegador |
| `provider` | `portal_provider` | não | — | Discriminador explícito. Nunca inferido em runtime (FR-11) |
| `base_url` | `text` | sim | — | Host do provider. Obrigatório para `evolution` e `uazapi` |
| `credentials` | `jsonb` | não | `'{}'` | Credenciais do provider. **Nunca sai da Edge Function** |
| `active` | `boolean` | não | `true` | Instância inativa não recebe link |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | Trigger `portal_set_updated_at` |

**Formato de `credentials` por provider** — validado por CHECK, não por confiança:

| Provider | Chaves obrigatórias | `base_url` |
|---|---|---|
| `zapi` | `token`, e opcionalmente `client_token` | não usa (host fixo do fornecedor) |
| `evolution` | `api_key` | **obrigatório** |
| `uazapi` | `token` | **obrigatório** |

```sql
alter table portal_instances add constraint portal_instances_credentials_ck check (
  case provider
    when 'zapi'      then credentials ? 'token'
    when 'evolution' then credentials ? 'api_key' and base_url is not null
    when 'uazapi'    then credentials ? 'token'   and base_url is not null
  end
);
```

**Índices:** `unique (external_id)` · `(active) where active` — a listagem de emissão só olha ativas
**Atende:** FR-01, FR-11, FR-12, FR-13, FR-14

### Tabela `portal_link_tokens`

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `instance_id` | `uuid` | não | — | FK → `portal_instances.id` `on delete cascade` |
| `token_hash` | `text` | não | — | SHA-256 do token. **Nunca o token.** UNIQUE |
| `expires_at` | `timestamptz` | não | — | Máx. 2h após a emissão (RNF-05) |
| `created_at` | `timestamptz` | não | `now()` | |
| `last_used_at` | `timestamptz` | sim | — | Última validação bem-sucedida |
| `use_count` | `integer` | não | `0` | Quantas vezes foi validado |

**Índices:** `unique (token_hash)` · `unique (instance_id)` — **uma instância tem no máximo um token
vivo**; emitir revoga o anterior (FR-14) · `(expires_at)` para a limpeza
**Atende:** FR-14, FR-15

> `use_count` e `last_used_at` existem porque o token é **multiuso até expirar** (decisão do
> usuário). Sem eles não há como distinguir "abriu duas vezes" de "está sendo varrido".

### Tabela `portal_access_log`

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `bigint` | não | identity | PK |
| `external_id` | `text` | sim | — | Texto puro: registrado mesmo quando a instância não existe |
| `instance_id` | `uuid` | sim | — | FK → `portal_instances.id` `on delete set null` |
| `action` | `text` | não | — | `session` · `connect` · `status` · `issue` |
| `outcome` | `text` | não | — | `ok` · `invalid_token` · `expired` · `not_found` · `inactive` · `provider_error` · `rate_limited` · `unauthorized` |
| `ip_hash` | `text` | sim | — | SHA-256 de (IP + sal). **Nunca IP em claro** (RNF-09) |
| `detail` | `text` | sim | — | Mensagem curta. Nunca token, credencial ou telefone |
| `created_at` | `timestamptz` | não | `now()` | |

**Índices:** `(ip_hash, created_at desc) where outcome <> 'ok'` — é a consulta do rate limit ·
`(instance_id, created_at desc)` — investigação da Bia · `(created_at)` — limpeza
**Atende:** FR-16, FR-18, FR-21

### Diagrama de relacionamento

```
portal_instances ─1──0..1─ portal_link_tokens      (cascade)
        └────────1──N───── portal_access_log        (set null)
```

Três tabelas, dois relacionamentos. O modelo é pequeno de propósito: o portal é uma ferramenta de
tarefa única, e cada tabela a mais é superfície a proteger.

---

## Políticas RLS

**Todas as três tabelas contêm segredo ou dado de auditoria. Nenhuma é legível por `anon` ou
`authenticated` — nem parcialmente.** Todo acesso passa por Edge Function com `service_role`, que
por definição ignora RLS.

```sql
alter table portal_instances   enable row level security;
alter table portal_link_tokens enable row level security;
alter table portal_access_log  enable row level security;
```

| Tabela | Operação | Regra em português | Policy |
|---|---|---|---|
| `portal_instances` | todas | Ninguém, exceto `service_role` | `using (false) with check (false)` |
| `portal_link_tokens` | todas | Ninguém, exceto `service_role` | idem |
| `portal_access_log` | todas | Ninguém, exceto `service_role` | idem |

```sql
create policy "sem acesso publico" on public.portal_instances
  for all to anon, authenticated using (false) with check (false);
-- idem para portal_link_tokens e portal_access_log
```

> **Por que policy explícita de negação, e não ausência de policy.** Em Postgres, RLS habilitado sem
> policy já nega tudo — o efeito é idêntico. A policy existe para **tornar a intenção legível**: um
> revisor que vê a tabela sem policy nenhuma não sabe se foi decisão ou esquecimento. Ver ADR-005.

**Nenhuma view é criada.** Se alguma for adicionada depois, é obrigatório `with (security_invoker = true)`
— sem isso a view executa como dono e atravessa a RLS das tabelas de baixo.

### Funções auxiliares

```sql
create schema if not exists portal_private;
revoke all on schema portal_private from anon, authenticated;

-- hash de token: sha256 hex, comparação por igualdade de hash
create or replace function portal_private.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

-- hash de IP com sal vindo do Vault — sal fixo por projeto, nunca versionado
create or replace function portal_private.hash_ip(p_ip text, p_salt text)
returns text language sql immutable set search_path = '' as $$
  select case when p_ip is null or p_ip = '' then null
         else encode(digest(p_ip || p_salt, 'sha256'), 'hex') end;
$$;
```

Exige `pgcrypto`. O sal do IP vem do Vault (`portal_ip_salt`) — **nunca em migration**.

### Retenção (FR-21)

```sql
select cron.schedule('portal-purge-access-log', '17 3 * * *', $$
  delete from public.portal_access_log where created_at < now() - interval '90 days';
$$);

select cron.schedule('portal-purge-expired-tokens', '*/30 * * * *', $$
  delete from public.portal_link_tokens where expires_at < now() - interval '1 day';
$$);
```

Ambos **versionados em migration** — é a correção do R-09.

---

## O adapter de provider

O núcleo técnico do projeto. Uma interface, três implementações, um registry.

```ts
export type ProviderId = 'zapi' | 'evolution' | 'uazapi';
export type ConnStatus = 'connected' | 'connecting' | 'disconnected';

export interface InstanceContext {
  externalId: string;
  baseUrl: string | null;
  credentials: Record<string, string>;
}

export interface ConnectResult {
  qrcode: string | null;    // sempre data URI pronta para <img src>
  paircode: string | null;
  status: ConnStatus;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly supportsPairing: boolean;
  connect(ctx: InstanceContext, opts: { phone?: string }): Promise<ConnectResult>;
  status(ctx: InstanceContext): Promise<{ status: ConnStatus }>;
}
```

### Mapa de tradução — verificado na fase 1

| | **Z-API** | **Evolution** | **UAZAPI** |
|---|---|---|---|
| Base | `https://api.z-api.io` (fixo) | `base_url` | `base_url` |
| Identificação | path: `/instances/{ext}/token/{cred.token}` | path: `/instance/...//{ext}` | header `token: {cred.token}` |
| Auth extra | header `Client-Token` (se houver) | header `apikey` | — |
| **Conectar (QR)** | `GET .../qr-code/image` | `GET /instance/connect/{ext}` | `POST /instance/connect` |
| **Pareamento** | `GET .../phone-code/{phone}` | `GET /instance/connect/{ext}?number={phone}` | `POST /instance/connect` body `{phone}` |
| **Status** | `GET .../status` | `GET /instance/connectionState/{ext}` | `GET /instance/status` ⚠️ |
| Campo do QR | `value` | `base64` | `instance.qrcode` ou `qrcode` |
| Campo do código | `value` | `pairingCode` ou `code` | `instance.paircode`, `code` ou `paircode` |
| Campo de conectado | `connected: bool` | `instance.state` | `connected` ou `instance.status` |
| Vocabulário de status | booleano | `open`/`connecting`/`close` | `connected`/`disconnected` |
| Suporta pareamento | sim | sim | sim |

> ⚠️ **`GET /instance/status`, sem o identificador no path.** O código atual usa
> `/instance/status/{id}`, que **não existe** — sondagem devolveu `404 Not Found`, idêntico ao 404
> de uma rota inventada, enquanto a rota correta devolveu `401 Missing token`. É o R-01, a causa do
> polling que nunca funcionou.

### Normalização de status

Uma expressão cobre os três, um termo por provider:

```ts
function normalizeStatus(raw: unknown): ConnStatus {
  const d = (raw as any)?.data ?? (raw as any)?.result ?? raw ?? {};
  if (d.connected === true || d.status === 'connected' || d.instance?.state === 'open') return 'connected';
  if (d.instance?.state === 'connecting' || d.status === 'connecting') return 'connecting';
  return 'disconnected';
}
```

### Normalização do QR

Providers devolvem base64 puro ou data URI. O adapter **sempre** entrega data URI pronta, para que o
front nunca precise adivinhar:

```ts
const toDataUri = (v: string) => v.startsWith('data:') ? v : `data:image/png;base64,${v}`;
```

### Registry

```ts
const adapters: Record<ProviderId, ProviderAdapter> = { zapi, evolution, uazapi };
export const getAdapter = (id: ProviderId): ProviderAdapter => {
  const a = adapters[id];
  if (!a) throw new ConfigError(`provider desconhecido: ${id}`);
  return a;
};
```

Adicionar um quarto provider: um arquivo, uma entrada no registry, um teste de contrato. Nada mais
muda. (FR-11, FR-12)

---

## Contratos de API

Todas as funções: `POST`, corpo JSON, resposta JSON. CORS restrito por `PORTAL_ALLOWED_ORIGINS`
(FR-17). Toda resposta de erro traz `error` (código estável) e `message` (texto para humano), mais
`request_id` nos 5xx (RNF-07).

### `portal-session` — abrir a página

**Entrada** `{ instance: string, token: string }`

**200** `{ label, status, supports_pairing, poll_interval_ms, qr_ttl_ms }`
**401** `{ error: "invalid_token", message: "Link expirado ou inválido." }`
**429** `{ error: "rate_limited", retry_after_seconds }`

Retorna **`label`, e nada mais que identifique a instância**. Sem provider, sem host, sem credencial.
Já traz o `status` — é o que permite detectar "já conectado" antes de qualquer QR (FR-09).

`404` **não existe neste contrato de propósito**: instância inexistente devolve o mesmo `401` de token
inválido, para não permitir enumeração (FR-01, FR-08).

**Atende:** FR-01, FR-08, FR-09

### `portal-connect` — gerar QR ou código

**Entrada** `{ instance, token, method: "qrcode" | "paircode", phone?: string }`

**200** `{ qrcode: string|null, paircode: string|null, status, qr_ttl_ms }`
**400** `{ error: "invalid_phone" | "pairing_unsupported" }`
**401** token inválido · **409** `{ error: "already_connected" }` · **429** rate limit
**502** `{ error: "provider_error", message, request_id }`

`phone` é obrigatório quando `method = "paircode"`, validado por `/^\d{10,15}$/` **antes** de chamar
o provider, e **nunca persistido** (RNF-10).

**Atende:** FR-02, FR-03, FR-04, FR-05, FR-12

### `portal-status` — polling

**Entrada** `{ instance, token }` · **200** `{ status }` · demais códigos iguais aos acima.

Endpoint mais chamado do sistema — é o que o teto de polling do FR-19 protege.

**Atende:** FR-06, FR-09, FR-19

### `portal-issue-link` — emitir link (automação)

**Cabeçalho obrigatório:** `x-portal-secret: <PORTAL_ISSUE_SECRET>`

**Entrada** `{ instance: string, ttl_minutes?: number }` (padrão 120, teto 120)

**200** `{ url, token, expires_at }`
**401** `{ error: "unauthorized" }` — segredo ausente ou errado
**404** `{ error: "not_found" }` · **409** `{ error: "inactive" }` ou `{ error: "no_credentials" }`

O token em claro é devolvido **uma única vez**; o banco guarda só o hash (FR-15). Emitir **revoga o
token anterior** da instância. Comparação do segredo em tempo constante.

**Atende:** FR-14

### Códigos de erro — vocabulário fechado

`invalid_token` · `rate_limited` · `invalid_phone` · `pairing_unsupported` · `already_connected` ·
`provider_error` · `config_error` · `unauthorized` · `not_found` · `inactive` · `no_credentials`

O front mapeia cada um para uma mensagem em português (FR-07). Código desconhecido cai numa mensagem
genérica **com** ação de tentar de novo — nunca tela em branco.

---

## Autenticação e autorização

**Não há usuários.** Três sujeitos, três mecanismos:

| Sujeito | Mecanismo | Alcance |
|---|---|---|
| Sandra (navegador) | token do link, no query string | **uma** instância, até `expires_at` |
| Automação | `x-portal-secret` no cabeçalho | emitir link para qualquer instância ativa |
| Edge Function | `service_role` | tudo — nunca sai do servidor |

### Validação do token — o coração da autorização

```
1. Normaliza instance e token (trim; recusa vazio)
2. hash = sha256(token)
3. SELECT ... FROM portal_link_tokens t
     JOIN portal_instances i ON i.id = t.instance_id
    WHERE t.token_hash = hash AND i.external_id = instance
      AND t.expires_at > now() AND i.active
4. Não achou  → registra outcome e devolve 401 genérico
5. Achou      → use_count += 1, last_used_at = now()
```

O passo 3 casa **hash e `external_id` na mesma consulta**. Validar em duas consultas separadas
permitiria usar o token da instância A na instância B.

### Rate limiting (FR-16)

Derivado de `portal_access_log` — sem infra adicional (ADR-005).

| Regra | Janela | Limite | Resposta |
|---|---|---|---|
| Falhas por `ip_hash` | 10 min | 10 | 429, `retry_after_seconds` |
| Requisições por instância | 10 min | 200 | 429 |

O teto de 200 por instância acomoda com folga a sessão legítima: polling de 5s por 5 min = 60
chamadas, mais renovações de QR. Já a varredura de token esbarra em 10 falhas.

---

## Estados e transições

### Estado da página (front)

```
                    ┌──────────────┐
                    │   loading    │  valida o token
                    └──────┬───────┘
             ┌─────────────┼──────────────┬──────────────┐
             ▼             ▼              ▼              ▼
        ┌────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐
        │expired │   │connected │   │    qr    │   │  error  │
        └────────┘   └──────────┘   └────┬─────┘   └─────────┘
          final         final            │
                          ▲              │ 3 ciclos sem conectar
                          │              ▼
                          │        ┌──────────┐
                          └────────┤  paused  │ botão "gerar novo QR"
                          detectou └────┬─────┘
                                        │ alterna
                                        ▼
                                  ┌──────────┐
                                  │ paircode │
                                  └──────────┘
```

- `loading → connected` direto quando `portal-session` já devolve conectado (FR-09)
- `qr → paused` após 3 renovações (FR-04); `paused → qr` pelo botão
- `qr|paircode|paused → connected` a qualquer momento pelo polling (FR-06)
- O polling para ao chegar em `connected`, `expired`, `error` ou após 5 min (FR-19)
- Aba em segundo plano pausa o polling; voltar retoma (FR-19)

### Estado da conexão (normalizado)

`disconnected → connecting → connected`, e `connected → disconnected` fora do controle do portal.
O portal **só observa** — nunca desconecta.

---

## Segurança — modelo de ameaça

| ID | Ameaça | Vetor | Mitigação | FR |
|---|---|---|---|---|
| SEC-01 | Varredura de token | Força bruta em `portal-session` | 128 bits de entropia + rate limit + 401 genérico | FR-15, FR-16 |
| SEC-02 | Token de uma instância usado em outra | Troca do `instance` na URL | Hash e `external_id` casados na mesma consulta | FR-01 |
| SEC-03 | Enumeração de instâncias | Comparar 404 com 401 | Resposta idêntica para inexistente e inválido | FR-01, FR-08 |
| SEC-04 | Vazamento de credencial pelo cliente | Resposta ou bundle | Nada além de `label` sai; varredura de segredo no CI | FR-13 |
| SEC-05 | Dump da tabela vira links válidos | Acesso ao banco | Só hash é armazenado | FR-15 |
| SEC-06 | Emissão não autorizada / DoS de invalidação | URL da função exposta | `x-portal-secret` comparado em tempo constante | FR-14 |
| SEC-07 | Abuso de cota de Edge Functions | Aba esquecida ou script | Teto de polling + rate limit | FR-16, FR-19 |
| SEC-08 | Injeção de filtro no PostgREST | Identificador com vírgula/aspas | Query parametrizada; proibido concatenar filtro | — |
| SEC-09 | Vazamento de dado pessoal (LGPD) | Log com IP ou telefone | IP só hasheado; telefone nunca persistido; 90 dias | FR-18, FR-21 |
| SEC-10 | Vazamento de informação por mensagem de erro | Resposta detalhada demais | Vocabulário fechado; detalhe do provider só no log | FR-07 |
| SEC-11 | Uso da API por origem arbitrária | CORS curinga | Lista explícita de origens | FR-17 |
| SEC-12 | Segredo em migration ou repositório | Commit | Vault; varredura no CI; `.env` fora do git | FR-20 |

**SEC-08 é o P-01 confirmado:** o código atual monta o filtro concatenando string
(`.not("instance_id","in","(" + ids.join(",") + ")")`). O novo código não constrói filtro por
concatenação em lugar nenhum.

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | front (build) | URL do projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | front (build) | Chave publicável — atravessa o gateway, não dá acesso a tabela |
| `SUPABASE_URL` | Edge Function | injetada pela plataforma |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | injetada pela plataforma. **Nunca no front** |
| `PORTAL_ISSUE_SECRET` | Edge Function | segredo da emissão (FR-14) |
| `PORTAL_ALLOWED_ORIGINS` | Edge Function | origens separadas por vírgula (FR-17) |
| `PORTAL_PUBLIC_URL` | Edge Function | base para montar a URL do link |
| `portal_ip_salt` | **Vault** | sal do hash de IP. Nunca em migration nem em `.env` |

`.env.example` documenta todas, com valores de exemplo e nenhum valor real (FR-20).

---

## Mapa FR → componente

| FR | Front | Edge Function | Banco |
|---|---|---|---|
| FR-01 | `ConnectPage` (loading) | `portal-session` | `portal_instances`, `portal_link_tokens` |
| FR-02 | `QrPanel` | `portal-connect` | — |
| FR-03 | `QrPanel` + `useQrRefresh` | `portal-connect` | — |
| FR-04 | `QrPanel` (paused) | `portal-connect` | — |
| FR-05 | `PairPanel` + `phone.ts` | `portal-connect` | — |
| FR-06 | `useConnectionPoll` | `portal-status` | — |
| FR-07 | `ErrorNotice` + `errors.ts` | todas | — |
| FR-08 | `ExpiredPanel` | `portal-session` | — |
| FR-09 | `ConnectPage` | `portal-session`, `portal-status` | — |
| FR-10 | todos os componentes | — | — |
| FR-11 | — | `_shared/adapters/registry.ts` | `portal_instances.provider` |
| FR-12 | — | `_shared/adapters/*` | — |
| FR-13 | build check | todas | RLS |
| FR-14 | — | `portal-issue-link` | `portal_link_tokens` |
| FR-15 | — | `_shared/token.ts` | `token_hash` |
| FR-16 | — | `_shared/ratelimit.ts` | `portal_access_log` |
| FR-17 | — | `_shared/cors.ts` | — |
| FR-18 | — | `_shared/audit.ts` | `portal_access_log` |
| FR-19 | `useConnectionPoll` | — | — |
| FR-20 | README, `.env.example` | — | migrations |
| FR-21 | — | — | `cron.schedule` |

Todos os 21 FRs têm componente atribuído. Nenhum órfão.
