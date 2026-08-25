# ADR-001 — Exigir plano Supabase Pro em produção

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-20, RNF-08, R-06

## Contexto

O portal é, por natureza, **ocioso**: só é usado quando uma instância cai. Pode passar semanas sem
uma única requisição.

A pesquisa (`01-pesquisa.md` §Limites) apurou em [supabase.com/pricing](https://supabase.com/pricing):

- **Free:** 500 MB de banco, 5 GB de egress, 500.000 invocações de Edge Function/mês, e
  **projeto pausado após 1 semana de inatividade**
- **Pro:** US$ 25/mês, 8 GB, 250 GB de egress, 2 milhões de invocações, **sem pausa**

O volume do projeto é irrisório: 3 tabelas, ~20 linhas, picos de dezenas de requisições por sessão de
reconexão. Nenhum limite de tamanho ou de cota é o problema.

## Alternativas consideradas

### A) Plano Pro
- ✅ Sem pausa por inatividade — o projeto responde quando for preciso
- ✅ Cota de invocação 4x maior, folga confortável para o polling
- ❌ Custo fixo de US$ 25/mês para um projeto que usa uma fração dos recursos

### B) Plano Free
- ✅ Custo zero
- ❌ **A pausa por inatividade quebra o produto no pior momento possível**: a instância caiu, o
  cliente abre o link, e o backend está dormindo
- ❌ Reativar exige ação manual no painel — exatamente o que o produto existe para evitar
- ❌ 500 mil invocações são esgotadas por ~29 abas esquecidas por um dia (R-06)

### C) Free com keep-alive artificial
- ✅ Custo zero mantido
- ❌ Exige um cron externo pingando o projeto só para não dormir: gasta cota para não perder cota
- ❌ Depende de infraestrutura de fora para o produto funcionar

## Decisão

**Escolhemos A.** A pausa por inatividade é incompatível com a natureza do produto — não é uma
limitação que se contorna com engenharia, é o oposto do requisito. A alternativa C troca um problema
por uma dependência externa frágil, e ainda consome a cota que pretendia preservar.

US$ 25/mês é irrelevante frente ao custo de uma hora de WhatsApp fora do ar.

## Consequências

**Positivas**
- O portal responde a qualquer momento, sem aquecimento
- Folga de cota mesmo com o polling antes do teto do FR-19

**Negativas** (aceitas)
- Custo fixo mensal para um projeto de volume mínimo
- Quem adotar o open source precisa saber disso — vira aviso explícito no README

**Passa a valer**
- `03-prd.md` §Dependências externas: plano Pro é dependência de produção
- README documenta a limitação do Free para adotantes

## Quando revisitar

Se o Supabase remover a pausa por inatividade do plano Free, ou se o projeto migrar para
infraestrutura própria — o Postgres e as funções não usam nada exclusivo da plataforma.
