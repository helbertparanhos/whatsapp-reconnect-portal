# QR Pair Portal

Um link de uso temporário, escopado a **uma única instância**, que o dono do número abre no celular
e reconecta o próprio WhatsApp sozinho — qualquer que seja o provider por trás.

Suporta **Z-API**, **Evolution API** e **UAZAPI** atrás da mesma interface, com o provider resolvido
a partir da instância.

---

## O problema que ele resolve

Quando o WhatsApp de um negócio cai, quem precisa reconectar é o dono do número. Mas a ferramenta
para isso é o painel do provider, que exige a credencial mestra e expõe **todas** as outras contas.

Na prática, isso deixa três saídas ruins:

1. dar acesso ao painel inteiro ao cliente, vazando as demais instâncias;
2. mandar um print do QR Code pelo WhatsApp — que expira em 20 segundos e vira uma imagem morta no
   chat;
3. fazer a reconexão junto com o cliente, por chamada.

Este projeto existe para uma quarta: **um link que dá acesso a uma instância, por tempo limitado, e
a mais nada.**

## Como funciona

```
  A automação detecta a queda
            │
            │  POST /portal-issue-link   (header: x-portal-secret)
            ▼
  O portal emite um token de uso temporário e devolve a URL
            │
            │  a automação envia o link ao responsável
            ▼
  https://seu-portal.exemplo.com/{instancia}?t={token}
            │
            ▼
  O cliente abre no celular, escaneia o QR, e a página confirma
```

O token é gerado **sob demanda**, no momento da queda — não existem links válidos parados. Ele vale
por até 2 horas, funciona para várias aberturas dentro dessa janela, e emitir um novo revoga o
anterior.

## Princípios de segurança

Não são detalhes de implementação — são a razão de o projeto existir.

| | |
|---|---|
| **A credencial do provider nunca chega ao navegador** | O front conhece apenas o identificador público da instância e o token do link |
| **O banco guarda apenas o hash do token** | Um dump da tabela não produz nenhum link válido |
| **RLS de negação total** | As três tabelas negam `anon` e `authenticated` explicitamente; todo acesso passa por Edge Function com `service_role` |
| **Um link, uma instância** | Hash e identificador são casados na mesma consulta — o token de A não vale em B |
| **Instância inexistente responde como token inválido** | Respostas idênticas impedem enumeração |
| **IP apenas hasheado, com sal** | Retenção de 90 dias, com rotina versionada em migration |
| **O telefone do pareamento nunca é persistido** | Repassado ao provider e descartado |
| **Rate limit por origem e por instância** | Sem infraestrutura adicional — derivado da própria auditoria |

## Como rodar

### Pré-requisitos

- Node.js 20+
- Um projeto Supabase — **plano Pro é obrigatório em produção**, porque o plano gratuito pausa o
  projeto após 1 semana de inatividade, e um portal de reconexão é ocioso por natureza. Ele só é
  usado quando algo cai; um backend dormindo derrota o propósito. Ver
  [ADR-001](docs/decisions/ADR-001-plano-supabase-pro.md).
- Ao menos uma instância em Z-API, Evolution API ou UAZAPI

### 1. Instalar

```sh
git clone <url-do-repositorio>
cd qr-pair-portal
npm install
```

### 2. Aplicar as migrations

Do diretório do projeto, com a CLI do Supabase apontando para o seu projeto:

```sh
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Isso cria três tabelas com prefixo `portal_`, o schema `portal_private`, e duas rotinas de retenção.
**Nenhuma tabela existente é criada, alterada ou renomeada** — o projeto pode conviver com um banco
que já tem outras coisas.

### 3. Configurar o front

```sh
cp .env.example .env
```

| Variável | O que é |
|---|---|
| `VITE_SUPABASE_URL` | URL do seu projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (anon) |

> Tudo com prefixo `VITE_` é embutido no bundle e é **público**. Nunca coloque um segredo aí — o CI
> varre o `dist/` e falha o build se encontrar.

### 4. Configurar as Edge Functions

No painel do Supabase, em Edge Functions → Secrets:

| Variável | O que é |
|---|---|
| `PORTAL_ISSUE_SECRET` | Segredo que autoriza a emissão de link. Gere com `openssl rand -hex 32` |
| `PORTAL_ALLOWED_ORIGINS` | Origens permitidas, separadas por vírgula. **Sem isto, tudo é negado** |
| `PORTAL_PUBLIC_URL` | URL base do portal, usada para montar o link |
| `PORTAL_IP_SALT` | Sal do hash de IP. Gere com `openssl rand -hex 32` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas pela plataforma.

```sh
supabase functions deploy portal-session portal-connect portal-status portal-issue-link
```

### 5. Cadastrar uma instância

```sql
-- Z-API: token obrigatório, client_token opcional (só se ativado na conta)
insert into portal_instances (external_id, label, provider, credentials) values
  ('SUA_INSTANCIA', 'Nome que o cliente vê', 'zapi',
   '{"token":"...", "client_token":"..."}'::jsonb);

-- Evolution API: base_url obrigatória
insert into portal_instances (external_id, label, provider, base_url, credentials) values
  ('nome-da-instancia', 'Nome que o cliente vê', 'evolution',
   'https://sua-evolution.exemplo.com', '{"api_key":"..."}'::jsonb);

-- UAZAPI: base_url obrigatória
insert into portal_instances (external_id, label, provider, base_url, credentials) values
  ('sua-instancia', 'Nome que o cliente vê', 'uazapi',
   'https://seu-host.exemplo.com', '{"token":"..."}'::jsonb);
```

Um `CHECK` no banco recusa a inserção se faltar a credencial que aquele provider exige — o erro
aparece no cadastro, não quando o cliente abre o link.

### 6. Rodar

```sh
npm run dev     # desenvolvimento
npm run build   # produção → dist/
npm test        # suíte completa
```

## Emitindo um link

```sh
curl -X POST "https://SEU-PROJETO.supabase.co/functions/v1/portal-issue-link" \
  -H "Content-Type: application/json" \
  -H "x-portal-secret: $PORTAL_ISSUE_SECRET" \
  -d '{"instance": "SUA_INSTANCIA"}'
```

```json
{
  "url": "https://seu-portal.exemplo.com/SUA_INSTANCIA?t=aBcD...",
  "token": "aBcD...",
  "expires_at": "2026-08-24T20:00:00.000Z",
  "label": "Nome que o cliente vê"
}
```

O token em claro é devolvido **uma única vez**. O banco guarda apenas o hash — não há como
recuperá-lo depois.

A emissão recusa instância inativa ou sem credencial utilizável, para que a automação descubra o
problema **antes** de mandar ao cliente um link que só falharia ao ser aberto.

## Automação (monitor de reconexão)

Emitir um link é uma chamada HTTP — qualquer agendador serve. Em [`examples/`](examples/) há um
fluxo pronto de [n8n](https://n8n.io) que faz o ciclo completo: a cada 15 min consulta o status com
`check_only` (sem gerar token) e, quando a instância cai, emite um link e o envia para onde você
configurar, sem repetir o aviso enquanto ela seguir fora. Todos os valores no arquivo são
placeholders — nada real viaja nele.

- [examples/n8n-reconnect-monitor.json](examples/n8n-reconnect-monitor.json) — importe no n8n
- [examples/README.md](examples/README.md) — o que preencher e onde plugar o seu envio

## Adicionando um provider

Três passos, e nada mais muda:

1. Crie `supabase/functions/_shared/adapters/seu-provider.ts` implementando `ProviderAdapter`
2. Registre em `registry.ts` e acrescente o valor ao enum `portal_provider` (nova migration)
3. Escreva o teste de contrato em `tests/adapters/`, **com resposta real gravada**

O último passo não é burocracia. Este projeto nasceu de um bug em que o endpoint de status de um
provider estava errado, o front engolia o erro, e o polling nunca funcionou — sem ninguém perceber.
Um teste com resposta inventada teria "confirmado" o endpoint errado.

## Deploy

O front é uma SPA estática: qualquer host de arquivos serve.

```sh
docker build -t qr-pair-portal .
docker run -p 8080:80 qr-pair-portal
```

O `Dockerfile` produz uma imagem que serve estáticos por nginx, **sem runtime Node em produção**.

## Documentação

| Documento | O que traz |
|---|---|
| [docs/prd.md](docs/prd.md) | Os 21 requisitos funcionais, com critérios de aceite |
| [docs/spec.md](docs/spec.md) | Arquitetura, modelo de dados, RLS, contratos, adapter |
| [docs/estrutura.md](docs/estrutura.md) | Onde cada arquivo mora e as regras invioláveis |
| [docs/ui.md](docs/ui.md) | As telas, os estados e os tokens de cor com contraste medido |
| [docs/decisions/](docs/decisions/) | Seis ADRs — o **porquê** de cada decisão de arquitetura |
| [examples/](examples/) | Fluxo de n8n de exemplo para o monitor de reconexão |

Os ADRs registram alternativas consideradas e consequências aceitas. Se algo parecer estranho, é
provável que exista um ADR explicando o que aquela escolha estava resolvendo.

## Limitações conhecidas

- **Não cadastra nem edita instância.** O portal só lê. Quem cria instância é o painel do provider.
- **Não tem login.** A autorização é o token do link; é a proposta do produto.
- **Usa polling, não webhook.** Webhook exigiria endpoint público e configuração manual em cada
  provider, para um ganho marginal depois que o polling ganhou teto.
- **Não substitui o painel do provider.** Não envia mensagem, não lista conversa, não configura
  webhook. Faz uma coisa: reconectar.

## Licença

MIT — ver [LICENSE](LICENSE).
