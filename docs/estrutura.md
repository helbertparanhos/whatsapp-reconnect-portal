# Estrutura de Pastas — QR Pair Portal
> Fase 3 · 2026-08-24 · versão 1.0
> Implementa: `03-spec.md` · Organização de SPA (ver ADR-006)

## Árvore

```
qr-pair-portal/
├── .github/workflows/ci.yml        typecheck · lint · testes · varredura de segredo · check de RLS
│
├── public/                         favicon e estáticos. NADA sensível — é servido cru
│
├── src/
│   ├── main.tsx                    ponto de entrada
│   ├── App.tsx                     rotas — só duas: /:instanceId e catch-all
│   ├── index.css                   tokens de tema (Tailwind)
│   │
│   ├── pages/
│   │   ├── ConnectPage.tsx         orquestra os 7 estados. NÃO contém lógica de provider
│   │   └── NotFound.tsx
│   │
│   ├── features/connect/           tudo do domínio de conexão vive aqui
│   │   ├── api.ts                  as 3 chamadas ao backend. Único lugar que monta requisição
│   │   ├── components/
│   │   │   ├── QrPanel.tsx         FR-02, FR-03, FR-04
│   │   │   ├── PairPanel.tsx       FR-05
│   │   │   ├── SuccessPanel.tsx    FR-06, FR-09
│   │   │   ├── ExpiredPanel.tsx    FR-08
│   │   │   ├── ErrorNotice.tsx     FR-07
│   │   │   └── Countdown.tsx       contador do QR (FR-03)
│   │   └── hooks/
│   │       ├── useSession.ts       valida o token na abertura (FR-01)
│   │       ├── useQrRefresh.ts     renovação com teto de 3 ciclos (FR-03, FR-04)
│   │       └── useConnectionPoll.ts polling com teto e pausa em background (FR-06, FR-19)
│   │
│   ├── lib/
│   │   ├── config.ts               lê import.meta.env. ÚNICO lugar que toca env no front
│   │   ├── errors.ts               código de erro → mensagem em português (FR-07)
│   │   ├── phone.ts                validação de telefone (FR-05)
│   │   └── utils.ts                cn() do shadcn
│   │
│   └── components/ui/              shadcn — SÓ os componentes efetivamente usados
│
├── supabase/
│   ├── config.toml                 verify_jwt = false nas 4 funções
│   │
│   ├── functions/
│   │   ├── _shared/                código compartilhado. Não é função, não tem rota
│   │   │   ├── adapters/
│   │   │   │   ├── types.ts        ProviderAdapter, ConnStatus, ConnectResult
│   │   │   │   ├── normalize.ts    normalizeStatus, toDataUri
│   │   │   │   ├── registry.ts     mapa provider → adapter (FR-11)
│   │   │   │   ├── zapi.ts
│   │   │   │   ├── evolution.ts
│   │   │   │   └── uazapi.ts
│   │   │   ├── cors.ts             origens permitidas (FR-17)
│   │   │   ├── db.ts               cliente service_role. Único lugar que o instancia
│   │   │   ├── token.ts            geração, hash e validação (FR-15)
│   │   │   ├── audit.ts            escrita no log (FR-18)
│   │   │   ├── ratelimit.ts        contagem sobre o log (FR-16)
│   │   │   ├── errors.ts           vocabulário fechado de erro
│   │   │   └── http.ts             json(), fail(), preflight
│   │   │
│   │   ├── portal-session/index.ts     FR-01, FR-08, FR-09
│   │   ├── portal-connect/index.ts     FR-02…FR-05
│   │   ├── portal-status/index.ts      FR-06
│   │   └── portal-issue-link/index.ts  FR-14 — protegida por x-portal-secret
│   │
│   └── migrations/
│       ├── 0001_portal_schema.sql      tipos, tabelas, índices, RLS, funções
│       └── 0002_portal_retencao.sql    cron de limpeza (FR-21)
│
├── tests/
│   ├── adapters/                   teste de contrato, um arquivo por provider
│   ├── functions/                  validação de token, rate limit, CORS
│   └── front/                      hooks e validação de telefone
│
├── .env.example                    toda variável, com descrição. NENHUM valor real
├── .gitignore                      inclui .env
├── Dockerfile                      build estático + nginx. Sem runtime Node
├── nginx.conf                      fallback de SPA + cabeçalhos de segurança
├── README.md                       clone → rodando (FR-20)
├── CONTRIBUTING.md
├── LICENSE
├── CLAUDE.md · AGENTS.md · .cursorrules
└── docs/                         memória do projeto (privado/ fora do git)
```

---

## Convenções de nome

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
| Commit | Conventional Commits, citando a task | `feat(adapter): registry de provider (TASK-09)` |

---

## Onde cada coisa mora

| Tipo de código | Lugar | Nunca |
|---|---|---|
| Lógica de provider | `functions/_shared/adapters/` | em `src/`, em página, em função de rota |
| Acesso ao banco | `functions/_shared/db.ts` + funções | em `src/` — o front não fala com o Postgres |
| Montagem de requisição ao backend | `features/connect/api.ts` | espalhado por componente |
| Leitura de variável de ambiente (front) | `lib/config.ts` | `import.meta.env` direto em componente |
| Mensagem de erro para o usuário | `lib/errors.ts` | string solta no JSX |
| Validação de entrada | `lib/phone.ts` (front) **e** na função (backend) | só num dos dois lados |
| Estado da tela | `ConnectPage.tsx` | duplicado nos painéis |

---

## Regras invioláveis

Estas não são preferências de estilo. Cada uma corresponde a um risco confirmado.

1. **Componente de UI não chama o banco nem o provider.** Só `features/connect/api.ts` fala com o
   backend. *(FR-13)*

2. **Nenhuma variável com segredo recebe prefixo `VITE_`.** Tudo com esse prefixo é embutido no
   bundle e é público. *(ADR-006, FR-13)*

3. **`catch` vazio é proibido.** Todo erro capturado vira estado visível ou registro. Foi um `catch {}`
   que escondeu o R-01 em produção por meses. *(FR-07, R-02)*

4. **Nenhum filtro de consulta é montado por concatenação de string.** Sempre parâmetro. Foi assim
   que nasceu o P-01/SEC-08.

5. **Nenhuma migration altera, renomeia ou apaga tabela que este projeto não criou.** *(ADR-004)*

6. **Toda tabela nasce com `enable row level security` e ao menos uma policy.** Verificado no CI.
   *(ADR-005)*

7. **Provider novo entra por arquivo + registry + teste de contrato.** Nunca por `if` em quem chama.
   *(ADR-002)*

8. **Nenhum laço de requisição sem teto.** Polling, renovação e retry têm limite explícito. *(FR-19, R-06)*

9. **Nenhuma resposta de API devolve credencial, host, identificador interno ou nome de tabela.**
   Só `label` sai. *(FR-13, SEC-04)*

10. **Nenhum identificador, nome, URL ou dado da operação de origem em arquivo versionado.** Vale para
    código, migration, teste, fixture, comentário e documentação. *(FR-20)*

---

## Testes

| Onde | O quê | Como roda |
|---|---|---|
| `tests/adapters/` | Contrato de cada provider: tradução de entrada e normalização de saída, com resposta gravada | `npm test` — sem rede |
| `tests/functions/` | Validação de token, rate limit, CORS, vocabulário de erro | `npm test` |
| `tests/front/` | Hooks (teto de polling, teto de renovação) e validação de telefone | `npm test` |

**Todo teste cita o FR que valida**, em comentário no topo do arquivo. É o que permite à fase 6
provar cobertura de requisito, não só de linha.

Os testes de contrato usam **resposta real gravada** de cada provider, não invenção. Uma resposta
inventada teria "confirmado" o endpoint errado do R-01.

---
