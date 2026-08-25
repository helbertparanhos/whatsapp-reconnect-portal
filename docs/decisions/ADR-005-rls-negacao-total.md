# ADR-005 — RLS de negação total com policy explícita, e rate limit derivado da auditoria

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-13, FR-16, FR-18, SEC-01, SEC-04, RNF-03

## Contexto

Duas decisões relacionadas, ambas sobre como proteger dados que **nenhum cliente pode ler**.

### O contexto do RLS

O padrão da stack é RLS por tenant: `authenticated` lê as linhas da própria organização, via função
que casa organização e papel na mesma linha.

**Este projeto não tem usuários.** Não há login, não há `auth.uid()`, não há organização. E as três
tabelas guardam, respectivamente: credenciais de provider, hashes de token de acesso, e log de
auditoria. **Nenhuma linha de nenhuma delas pode ser lida por `anon` ou `authenticated`** — nem
parcialmente, nem com filtro.

Em Postgres, RLS habilitado sem policy nenhuma já nega tudo. A pergunta é se se escreve a policy
mesmo assim.

### O contexto do rate limit

Edge Functions do Supabase não têm rate limit nativo. O FR-16 exige limitar tentativas por origem e
por instância. O volume real é baixíssimo: dezenas de requisições por sessão de reconexão, poucas
sessões por dia.

## Alternativas consideradas

### RLS — A) Policy explícita de negação
- ✅ A intenção fica legível: quem revisa vê que foi decisão, não esquecimento
- ✅ Verificável no CI por consulta a `pg_policies`
- ❌ Policy que nunca casa pode confundir quem espera policy funcional

### RLS — B) Nenhuma policy
- ✅ Menos SQL, mesmo efeito prático
- ❌ **Indistinguível de esquecimento.** Tabela sem policy é o sintoma clássico de RLS mal feito, e
  um revisor não tem como saber a diferença
- ❌ Um check de CI que exija "toda tabela com policy" acusaria falso positivo

### Rate limit — A) Derivado de `portal_access_log`
- ✅ Zero infraestrutura nova: a tabela de auditoria já é obrigatória pelo FR-18
- ✅ Um índice parcial resolve a consulta
- ✅ O adotante do open source não precisa provisionar nada além do Supabase
- ❌ Uma leitura a mais por requisição
- ❌ Contagem não é atômica sob concorrência extrema — irrelevante neste volume

### Rate limit — B) Redis ou proxy dedicado
- ✅ Contagem atômica, latência menor
- ❌ Infraestrutura nova para um problema que não existe neste volume
- ❌ Barreira de adoção para quem clonar o projeto

## Decisão

**RLS: escolhemos A** — policy explícita `using (false) with check (false)` para `anon` e
`authenticated` nas três tabelas. Custa três linhas de SQL e elimina a ambiguidade entre "decisão" e
"esquecimento". O CI passa a exigir policy em toda tabela, sem exceção a documentar.

**Rate limit: escolhemos A** — contagem sobre `portal_access_log`, janela de 10 minutos, com índice
parcial `(ip_hash, created_at desc) where outcome <> 'ok'`. A tabela já existe por outro requisito;
usá-la para os dois fins não adiciona superfície nem dependência.

## Consequências

**Positivas**
- Impossível ler credencial ou token pelo cliente, com a intenção documentada no próprio schema
- Uma tabela serve a auditoria e a proteção contra varredura
- O projeto sobe com Supabase e nada mais — requisito de adoção do open source

**Negativas** (aceitas)
- Toda leitura passa por Edge Function: sem acesso direto pelo cliente, nem para telas futuras
- A contagem do rate limit não é atômica; sob concorrência extrema pode deixar passar alguma
  requisição além do limite. Aceitável: o limite é defesa em profundidade, não a única barreira —
  a entropia do token é
- `portal_access_log` cresce com o tráfego; mitigado pela retenção de 90 dias (FR-21)

**Passa a valer**
- As três tabelas nascem com `enable row level security` **e** policy de negação
- Toda view futura exige `with (security_invoker = true)`
- O CI verifica: toda tabela `portal_*` tem RLS habilitado e ao menos uma policy
- `_shared/ratelimit.ts` é o único lugar que implementa a contagem

## Quando revisitar

Se o portal ganhar uma tela autenticada (painel do operador, hoje `Could`), aí passa a existir
`auth.uid()` e as policies deixam de ser de negação total. Para o rate limit: se o volume passar de
alguns milhares de requisições por minuto.
