# ADR-006 — Manter Vite + React (SPA) em vez de migrar para Next.js

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-10, FR-13, FR-20, RNF-01
- **Divergência:** a stack padrao adotada prevê Next.js (App Router)

## Contexto

A stack padrão da casa é Next.js com App Router, e este projeto **diverge** dela. Divergência de
padrão exige registro — é a razão deste ADR.

O que o projeto é, de fato:

- **Uma tela só**, com sete estados (carregando, QR, pareamento, sucesso, expirado, erro, pausado)
- **Nenhum conteúdo indexável.** Toda URL é um link privado, de vida curta, entregue por WhatsApp.
  SEO é irrelevante e indexação seria indesejada
- **Nenhum dado no primeiro paint.** A página abre em estado de carregamento por definição: precisa
  validar o token antes de qualquer coisa
- **Nenhum segredo no front.** Todo acesso a dado passa por Edge Function, por exigência do FR-13

O código atual já é Vite + React, com build validado: `tsc` limpo, bundle de 320 kB, build em 6,4s.

## Alternativas consideradas

### A) Manter Vite + React como SPA estática
- ✅ Zero risco de regressão: o que existe já compila e roda
- ✅ Deploy é um diretório de arquivos estáticos — container mínimo, nginx
- ✅ Barreira de adoção baixíssima para o open source: `npm i && npm run dev` (FR-20)
- ✅ Nenhum runtime Node em produção: menos superfície de ataque, nada para atualizar por CVE
- ❌ Sem SSR — irrelevante aqui, mas fecha a porta se um dia houver página pública

### B) Migrar para Next.js (App Router)
- ✅ Alinha com o padrão da casa
- ✅ Route Handlers poderiam substituir as Edge Functions, unificando o deploy
- ❌ Reescrever a tela e o backend inteiro, sem ganho de produto
- ❌ SSR não agrega: não há dado no primeiro paint nem conteúdo indexável
- ❌ Runtime Node em produção — mais superfície e mais manutenção que servir estáticos
- ❌ Adotante precisaria rodar um servidor Node, não só publicar arquivos

### C) Vite no front, API Node própria no lugar das Edge Functions
- ✅ Rate limit em memória, sem ida ao banco
- ❌ Uma infraestrutura a mais para operar e para o adotante subir
- ❌ Perde a injeção automática de `service_role` da plataforma

## Decisão

**Escolhemos A.** Os benefícios do Next.js — SSR, roteamento por arquivo, SEO — não se aplicam a uma
tela única, privada, que abre carregando. A migração seria custo puro.

Dois argumentos pesam além do custo:

1. **Superfície de ataque.** Servir estáticos não executa código no servidor. Num produto cuja
   proposta é segurança de acesso, ter menos runtime é ganho direto.
2. **Adoção do open source.** O projeto existe para ser clonado. "Publique esta pasta" é uma barreira
   muito menor que "suba um servidor Node".

A alternativa C resolveria o rate limit com mais elegância, mas ADR-005 já mostrou que o volume não
justifica infraestrutura adicional.

## Consequências

**Positivas**
- O código atual é aproveitado; o esforço vai para adapter, segurança e UX
- Deploy trivial e barato, em qualquer host de estáticos
- Front e backend evoluem separados: trocar a SPA não toca nas funções

**Negativas** (aceitas)
- Diverge do padrão da casa: quem vier de outro projeto o time encontra estrutura diferente
- Sem SSR: uma página pública futura exigiria revisitar
- Duas unidades de deploy (estáticos + funções) em vez de uma
- Variáveis `VITE_*` são embutidas no bundle em build — por isso **só** valores publicáveis podem
  usar esse prefixo, e o CI verifica

**Passa a valer**
- `03-estrutura.md` segue a organização de SPA, não a de App Router
- Nenhuma variável com segredo recebe prefixo `VITE_`
- O CI varre o `dist/` em busca de segredo conhecido (FR-13)
- Dockerfile serve estáticos, sem runtime Node em produção

## Quando revisitar

Se o projeto ganhar página pública indexável, ou um painel autenticado de operador com dado no
primeiro paint. Nenhum dos dois está no MVP — o painel é `Could`.
