# Contribuindo

Obrigado pelo interesse. Este documento explica como o projeto é organizado e o que uma contribuição
precisa atender para ser aceita.

## Antes de escrever código

Leia [docs/estrutura.md](docs/estrutura.md). Ele diz onde cada arquivo mora e traz **dez regras
invioláveis**. Nenhuma delas é preferência de estilo: cada uma corresponde a um bug que já aconteceu
em produção, e o comentário no código costuma dizer qual.

Se sua mudança contraria uma decisão de arquitetura, ela precisa de um ADR novo em
[docs/decisions/](docs/decisions/) — não de uma exceção silenciosa.

## Ambiente

```sh
npm install
cp .env.example .env    # preencha
npm run dev
```

Antes de abrir PR:

```sh
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build && node scripts/check-bundle.mjs
```

O CI roda tudo isso, mais `deno check` nas Edge Functions e quatro verificações de segurança.

## As regras que o CI recusa

| Regra | Por quê |
|---|---|
| **`catch` vazio** | Um `catch {}` escondeu por meses o fato de que o polling de um provider nunca funcionou. Todo erro capturado vira estado visível ou registro |
| **Segredo com prefixo `VITE_`** | Tudo com esse prefixo é embutido no bundle e é público |
| **Migration fora do prefixo `portal_`** | O banco pode ser compartilhado e ter consumidores não mapeados. Nenhuma migration toca tabela que este projeto não criou |
| **Segredo no `dist/`** | Última barreira entre uma chave e a internet |

Outras regras não verificáveis por CI, mas igualmente firmes:

- **`res.ok` antes de `res.json()`.** Resposta de erro pode vir em HTML — de um proxy, do gateway,
  de uma página de manutenção. Sem a checagem vira exceção genérica sem causa.
- **Nenhum laço de requisição sem teto.** Polling, renovação e retry têm limite explícito.
- **Nenhum filtro de consulta montado por concatenação de string.** Sempre parâmetro.
- **Nenhuma resposta de API devolve credencial, host, id interno ou nome de tabela.**
- **Sem `any`.**

## Adicionando um provider

É o tipo de contribuição mais provável, e o projeto foi desenhado para que ela toque pouca coisa:

1. `supabase/functions/_shared/adapters/seu-provider.ts`, implementando `ProviderAdapter`
2. Uma entrada em `registry.ts` e um valor novo no enum `portal_provider` (migration nova)
3. Um teste de contrato em `tests/adapters/`

### O teste de contrato usa resposta real

Grave a resposta que a API realmente devolve e coloque em `tests/adapters/fixtures.ts`, com um
comentário dizendo de onde ela veio.

**Não invente a resposta.** O bug que originou este projeto foi um endpoint de status errado: o
código chamava uma rota que não existe, o erro era engolido, e ninguém percebeu. Um teste com
resposta inventada teria "confirmado" a rota errada e o bug continuaria vivo com a suíte verde.

O teste deve verificar, no mínimo:

- a **URL exata** que o adapter monta (método, path, query)
- os **cabeçalhos** enviados
- que o status traduz para `connected` / `connecting` / `disconnected`
- que o QR sai como data URI
- que erro HTTP vira `provider_error` sem vazar credencial na mensagem

## Commits e PRs

Conventional Commits, citando a origem quando houver:

```
feat(adapter): suporte ao provider X
fix(qr): contador nao reiniciava apos renovacao manual
```

Na descrição do PR, diga **o que quebrava antes** e **como verificar que parou de quebrar**. Um
diff que não explica o que estava errado é um diff que ninguém consegue revisar direito.

## Segurança

Encontrou uma vulnerabilidade? **Não abra issue pública.** Escreva em privado para quem mantém o
repositório, com passos de reprodução. Correção primeiro, divulgação depois.

Achados de segurança com passo a passo de reprodução não vão para o repositório: num projeto público,
isso é roteiro de ataque contra as instalações que estão no ar.

## Idioma

Código, comentários e documentação em **português**, sem acento em identificador. A persona do
produto é brasileira e não técnica, e o texto que ela lê precisa ser escrito por quem pensou nela.
Issues e PRs em português ou inglês, como preferir.
