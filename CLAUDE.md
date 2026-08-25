<!-- Gerado a partir da spec. Alteracoes aqui precisam refletir docs/. -->

# QR Pair Portal — Instruções para agentes de código

Portal self-service de reconexão de WhatsApp. Um link de uso temporário, escopado a **uma**
instância, que o dono do número abre no celular e reconecta sozinho — falando com Z-API, Evolution
API ou UAZAPI por trás da mesma interface.

Este projeto é governado por spec. Antes de escrever qualquer linha de código, leia:

| Arquivo | O que é |
|---|---|
| `docs/prd.md` | Requisitos funcionais (FR-01…FR-21) e critérios de aceite |
| `docs/spec.md` | Arquitetura, modelo de dados, RLS, contratos, adapter |
| `docs/estrutura.md` | Onde cada arquivo mora e as convenções de nome |
| `docs/ui.md` | Telas, estados e tokens de cor com contraste medido |
| `docs/decisions/` | ADR-001…ADR-006 — o porquê de cada decisão |

## Regras vinculantes

1. **Toda alteração atende a uma task.** Comece dizendo qual `TASK-NN` está implementando.
   Não há task para o que foi pedido? Pare e diga que precisa de discussao antes.
2. **Não invente requisito.** O que não estiver no PRD não existe. Achou que falta algo?
   Aponte, não implemente.
3. **Não contrarie a spec.** Divergiu, precisa de ADR novo em `docs/decisions/` — pare e explique o conflito.
4. **Siga `docs/estrutura.md` literalmente.** Ele diz onde cada arquivo mora e como se chama.
5. **Critério de aceite é a definição de pronto.** Task não fecha sem todos os critérios do FR
   correspondente atendidos — inclusive os de **estado vazio, erro e permissão**.

## Nunca

Cada item corresponde a um risco confirmado em produção. Não são preferências.

- ❌ **`catch` vazio, ou erro engolido sem virar estado visível ou registro.** Foi um `catch {}` que
  escondeu por meses o fato de que o polling de um provider nunca funcionou (R-01/R-02).
- ❌ **`res.json()` sem checar `res.ok` antes.** Erro HTTP com corpo não-JSON vira exceção genérica e
  o usuário não descobre a causa (P-10).
- ❌ **Laço de requisição sem teto.** Polling, renovação de QR e retry têm limite explícito. Sem teto,
  uma aba esquecida gera 720 invocações por hora (R-06).
- ❌ **Filtro de consulta montado por concatenação de string.** Sempre parâmetro. Concatenar
  identificadores num filtro `in` foi como nasceu o SEC-08 — um valor com vírgula apaga dados de
  quem não devia.
- ❌ **Credencial de provider, host, id interno ou nome de tabela numa resposta de API.** Só `label`
  sai para o navegador (FR-13).
- ❌ **Segredo em variável com prefixo `VITE_`.** Tudo com esse prefixo é embutido no bundle e é
  público. O CI varre o `dist/` e falha se achar (ADR-006).
- ❌ **`SUPABASE_SERVICE_ROLE_KEY` em qualquer arquivo de `src/`.** Ele só existe dentro de Edge
  Function.
- ❌ **Componente de UI chamando o backend ou o provider direto.** Só `features/connect/api.ts` monta
  requisição.
- ❌ **Tabela nova sem `enable row level security` e sem pelo menos uma policy.** As três tabelas do
  projeto usam policy de negação explícita — ver ADR-005.
- ❌ **View nova em `public` sem `with (security_invoker = true)`** — sem isso ela executa como dono e
  atravessa a RLS das tabelas de baixo.
- ❌ **Migration que altera, renomeia ou apaga tabela que este projeto não criou.** O banco é
  compartilhado e há centenas de automações não mapeadas consumindo-o (ADR-004, R-12).
- ❌ **Validar token e instância em consultas separadas.** Hash e `external_id` casam na **mesma**
  consulta, senão o token da instância A vale na B (SEC-02).
- ❌ **Responder 404 para instância inexistente.** Inexistente e token inválido devolvem a **mesma**
  resposta 401, senão dá para enumerar instâncias (SEC-03).
- ❌ **Provider tratado por `if` em quem chama.** Provider entra por arquivo em `_shared/adapters/` +
  registry + teste de contrato (ADR-002).
- ❌ **Inferir provider por formato de identificador em runtime.** A coluna `provider` é a verdade. O
  formato só serve para preencher a coluna uma vez, na migração (ADR-002).
- ❌ **Persistir telefone.** Ele é repassado ao provider e descartado (RNF-10).
- ❌ **IP em claro no log.** Só hash com sal vindo do Vault (RNF-09).
- ❌ **Teste de contrato com resposta inventada.** Use resposta real gravada — uma resposta inventada
  teria "confirmado" o endpoint errado do R-01.
- ❌ **Qualquer identificador, nome, URL ou dado da operação de origem em arquivo versionado.** Vale
  para código, migration, teste, fixture, comentário e documentação (FR-20).
- ❌ **`any` em TypeScript.**
- ❌ **Editar `docs/` à mão** — é gerado a partir da spec.

## Convenções

| Coisa | Convenção | Exemplo |
|---|---|---|
| Componente React | PascalCase, arquivo igual ao componente | `QrPanel.tsx` |
| Hook | `use` + camelCase | `useConnectionPoll.ts` |
| Módulo utilitário | camelCase | `phone.ts` |
| Edge Function | kebab-case, prefixo `portal-` | `portal-issue-link/` |
| Tabela | snake_case, prefixo `portal_` | `portal_link_tokens` |
| Tipo Postgres | snake_case, prefixo `portal_` | `portal_provider` |
| Migration | `NNNN_descricao_snake.sql`, sequencial | `0001_portal_schema.sql` |
| Teste | `<alvo>.test.ts`, espelhando o caminho | `tests/adapters/zapi.test.ts` |
| Branch | `tipo/TASK-NN-descricao` | `feat/TASK-09-adapter-registry` |
| Commit | Conventional Commits citando a task | `feat(adapter): registry de provider (TASK-09)` |

Todo arquivo de teste cita no topo, em comentário, o **FR que valida**.

## Stack

| Camada | Escolha | Versão | ADR |
|---|---|---|---|
| Front | Vite + React (SPA estática) | 5.x / 18.x | ADR-006 |
| Linguagem | TypeScript strict | 5.8 | — |
| Estilo | Tailwind + shadcn/ui | 3.4 | — |
| Backend | Supabase Edge Functions (Deno) | — | — |
| Banco | Postgres (Supabase), plano Pro | 15 | ADR-001 |
| Deploy | Easypanel (Docker, estático) | — | ADR-006 |

**Não há login, não há `auth.uid()`, não há organização.** A autorização é o token do link. Por isso
as funções rodam com `verify_jwt = false` e as tabelas têm RLS de negação total, acessadas só por
`service_role` dentro de Edge Function.

## Ao terminar uma task

1. `npm test`
2. `npx tsc --noEmit`
3. `npm run build`
4. Commit: `tipo(escopo): descrição (TASK-NN)`
5. Atualize a documentação em `docs/` se a spec mudou
