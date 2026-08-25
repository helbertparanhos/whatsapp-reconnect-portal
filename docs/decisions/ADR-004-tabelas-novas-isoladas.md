# ADR-004 — Tabelas novas com prefixo próprio, sem tocar nas existentes

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-20, R-12, pior cenário nº 2

## Contexto

O portal roda hoje num projeto Postgres **compartilhado por toda uma operação**: 241 tabelas, das
quais o portal usa duas — e nenhuma das duas foi criada para ele.

A investigação de dependências apurou:

- A tabela de instâncias usada pelo portal é, na verdade, a tabela de usuários de um **produto de
  rastreio de link e atribuição de campanha**. As colunas de instância e credencial foram penduradas
  nela depois. Das 16 colunas, 4 têm relação com reconexão.
- Ela é **quente**: ~72 mil leituras e 4.208 escritas acumuladas, tráfego que não tem nada a ver com
  o portal.
- **285 dos 651 workflows de automação usam o banco**, e não há como saber quais tocam quais tabelas
  por busca — o nome da tabela fica em parâmetro de nó, que a API de busca não varre.
- Existem duas tabelas vazias com modelo multi-provider razoável, mas nunca usadas.

O projeto também precisa virar **open source sem nenhuma informação da operação de origem** — e nomes
de tabela proprietários são informação da operação.

## Alternativas consideradas

### A) Tabelas novas com prefixo próprio, origens intocadas
- ✅ O portal é dono exclusivo do que escreve
- ✅ Nomes genéricos, publicáveis, sem rastro da operação
- ✅ Zero risco de quebrar automação: nenhuma tabela existente muda
- ✅ Migrations rodam do zero em qualquer projeto Supabase vazio (FR-20)
- ❌ Duplica o cadastro de instância: exige sincronização

### B) Reaproveitar as tabelas multi-provider vazias
- ✅ Já existem, com modelo parecido
- ❌ Nomes e colunas fixados por outra decisão, sem contexto de por quê
- ❌ Continuam presas ao projeto da operação — não resolvem o open source
- ❌ Estão vazias há tempo suficiente para ninguém lembrar da intenção original

### C) Estender as tabelas atuais com as colunas que faltam
- ✅ Fonte única de verdade, sem sincronização
- ❌ **Altera tabela quente com 285 possíveis consumidores não mapeados.** É literalmente o pior
  cenário declarado pelo usuário
- ❌ Amarra o schema publicado a nomes proprietários

## Decisão

**Escolhemos A.** As alternativas B e C compartilham o mesmo defeito fatal: mantêm o portal preso ao
banco de uma operação específica, o que é incompatível com o objetivo declarado de publicar o
projeto.

A alternativa C ainda adiciona risco operacional inaceitável: mexer numa tabela com consumidores
desconhecidos, quando o próprio usuário definiu "quebrar automação que está rodando" como um dos dois
piores resultados possíveis.

A duplicação do cadastro é o preço, e é **barato**: são poucas dezenas de instâncias, e a
sincronização é um fluxo de automação simples que já tem quem a escreva.

## Consequências

**Positivas**
- O portal roda em qualquer projeto Supabase, inclusive um dedicado
- Nenhuma migration referencia nome de tabela proprietário
- O schema publicado é legível por quem não conhece a operação
- Impossível quebrar automação existente por alteração de schema

**Negativas** (aceitas)
- Instância cadastrada em dois lugares até que a sincronização exista
- A sincronização vira dependência da fase 7
- Divergência temporária entre origem e portal é possível — mitigada pela emissão sob demanda, que
  valida a instância no momento do uso

**Passa a valer**
- Três tabelas novas com prefixo `portal_`
- **Nenhuma migration deste projeto altera, renomeia ou apaga tabela pré-existente**
- O mapa dos consumidores é task da fase 7, pré-requisito de qualquer mexida nas automações

## Quando revisitar

Depois que o mapa dos 285 workflows existir e provar que a sobreposição é pequena. Aí a unificação
volta a ser discutível — mas só depois do mapa, nunca antes.
