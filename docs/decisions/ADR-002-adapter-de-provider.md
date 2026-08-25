# ADR-002 — Adapter por provider com discriminador explícito no banco

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-11, FR-12, R-03, R-04

## Contexto

São **três** providers em produção (`01-pesquisa.md`): Z-API, Evolution API e UAZAPI. A fase 1
verificou que divergem em tudo que importa:

| | Z-API | Evolution | UAZAPI |
|---|---|---|---|
| Identificação | no path | no path | **no header** |
| Credenciais | 1-2 | 1 + host | 1 + host |
| Conectar | `GET` | `GET` | **`POST`** |
| Pareamento | path | query string | **body** |
| Campo do QR | `value` | `base64` | `instance.qrcode` |
| Status | booleano | `open`/`close` | `connected` |

O código atual assume um único provider, com o host em variável de ambiente global.

O discriminador hoje existente na operação é uma **string vazia** para um dos providers, e duas
linhas estão marcadas com um provider apontando para o host de outro.

Descoberta relevante: o **formato do identificador denuncia o provider** com correlação perfeita nos
dados reais (prefixo+hex, 32 hex maiúsculo, UUID).

## Alternativas consideradas

### A) Interface comum com registry, discriminador em coluna enum
- ✅ Cada provider é um arquivo isolado, testável sozinho por teste de contrato
- ✅ Quem chama não conhece provider: fala só o vocabulário normalizado
- ✅ Provider novo = 1 arquivo + 1 entrada no registry + 1 teste
- ❌ Exige escrever e manter três implementações e a normalização

### B) Condicionais no lugar do adapter
- ✅ Menos arquivos, mais direto para dois providers
- ❌ Com três, vira cadeia de `if` duplicada em cada função (conectar, status, pareamento)
- ❌ Adicionar provider obriga a caçar todos os pontos de decisão

### C) Detectar o provider pelo formato do identificador em runtime
- ✅ Zero configuração: funciona sem coluna nenhuma
- ❌ **Heurística silenciosa.** Um provider que mude o formato de id quebra tudo sem erro claro
- ❌ Troca um discriminador frágil (string vazia) por outro (regex)

## Decisão

**Escolhemos A, com o discriminador em coluna `enum NOT NULL`.**

A alternativa C é usada **uma única vez, na migração de dados**, para preencher a coluna a partir do
formato — e nunca em runtime. Inferir provider a cada requisição é adivinhar quando a resposta pode
simplesmente estar guardada.

A coluna é `enum`, não `text`: string vazia como discriminador foi o R-04, e `enum` torna esse estado
impossível de representar.

## Consequências

**Positivas**
- Cada provider ganha teste de contrato próprio — foi a ausência disso que deixou o R-01 vivo
- Quarto provider não toca em código existente
- O front nunca sabe qual provider está por trás

**Negativas** (aceitas)
- Três implementações para manter, com três contas de teste
- A normalização de status é ponto de acoplamento: vocabulário novo exige atualizá-la

**Passa a valer**
- `03-spec.md` §Adapter é normativo
- `portal_instances.provider` é `enum NOT NULL`, com CHECK de credenciais por provider
- Todo provider tem teste de contrato — sem ele, não entra no registry

## Quando revisitar

Se aparecer um quarto provider cuja semântica não caiba em `connect`/`status` — por exemplo, um que
exija confirmação em duas etapas.
