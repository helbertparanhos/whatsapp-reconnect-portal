# Exemplo de automação — Monitor de reconexão (n8n)

Este é um fluxo **de exemplo** para o [n8n](https://n8n.io) que monitora uma instância de
WhatsApp e, quando ela cai, pede ao portal um link de reconexão e envia esse link para onde você
quiser (um grupo, um canal, um número).

> ⚠️ **Nenhum valor real neste arquivo.** Todos os campos sensíveis são placeholders
> (`SUA_INSTANCIA`, `SEU_GRUPO@g.us`, `sua-chave-publicavel-anon`, …). Preencha com os seus antes
> de ativar. As credenciais (segredo do portal e Redis) você cria no próprio n8n — elas **não**
> ficam no JSON.

O fluxo demonstra o padrão que o portal foi desenhado para suportar: **checar sem emitir**
(`check_only`) a cada ciclo, e só **emitir um link** no momento em que decide avisar. Assim o
token nasce fresco no incidente e não é rotacionado a cada checagem — um link já enviado ao
cliente nunca é invalidado por uma verificação de rotina.

---

## Como importar

1. No n8n: **Workflows → Import from File** e escolha
   [`n8n-reconnect-monitor.json`](n8n-reconnect-monitor.json).
2. Abra o nó **Config** e preencha os cinco valores (tabela abaixo).
3. Crie as duas credenciais e ligue nos nós que as usam (seção *Credenciais*).
4. Implemente o envio nos dois nós **"… (seu WhatsApp)"** (seção *Onde você entra*).
5. Ative o workflow.

---

## O que preencher — nó `Config`

| Campo | O que é | Exemplo |
|---|---|---|
| `portal_url` | Base das Edge Functions do seu Supabase | `https://SEU-PROJETO.supabase.co/functions/v1` |
| `anon_key` | Chave publicável (anon) do Supabase | `sua-chave-publicavel-anon` |
| `instance` | `external_id` da instância na tabela `portal_instances` | `SUA_INSTANCIA` |
| `notify_target` | Para onde vai o aviso (grupo, canal, número) | `SEU_GRUPO@g.us` |
| `state_key` | Chave do estado no Redis (deduplica avisos) | `reconexao:SUA_INSTANCIA` |

> A `anon_key` vai no header `apikey` só para satisfazer o gateway do Supabase. **Quem autoriza a
> emissão do link é o segredo do portal** (`x-portal-secret`), que viaja na credencial, nunca no
> corpo nem na URL.

---

## Credenciais (criadas no n8n, fora do JSON)

| Credencial | Tipo | Usada em | Como preencher |
|---|---|---|---|
| Segredo do portal | **Header Auth** | `Checa status (portal)`, `Emite link (portal)` | Nome do header: `x-portal-secret` · Valor: o `PORTAL_ISSUE_SECRET` que você configurou nas Edge Functions |
| Redis | **Redis** | os quatro nós Redis | host/porta/senha do seu Redis |

Depois de criar cada uma, abra os nós correspondentes e selecione a credencial no campo de
autenticação.

---

## Onde você entra — o envio

Os nós **`Envia o link (seu WhatsApp)`** e **`Avisa reconectado (seu WhatsApp)`** são
*No-Operation* de propósito: o portal não envia mensagem, ele só **emite o link**. Substitua cada
um pelo seu mecanismo de envio — por exemplo:

- **Z-API:** `POST https://api.z-api.io/instances/{id}/token/{token}/send-text`
- **Evolution API:** `POST {host}/message/sendText/{instance}`
- **WhatsApp Cloud API:** `POST https://graph.facebook.com/v20.0/{phone_id}/messages`
- ou qualquer gateway próprio.

O link a enviar está em `{{ $json.url }}` (saída do nó **`Emite link (portal)`**). Uma mensagem
típica:

```
Opa! O WhatsApp de {{ $('Emite link (portal)').item.json.label }} caiu.
Para reconectar, é só abrir este link e escanear o QR: {{ $json.url }}
```

---

## Como o fluxo decide (a lógica)

```
Cron 15min → Config → (janela de horário?) → Checa status (check_only)
                                                     │
                                        ┌── connected ┴── disconnected ──┐
                                        │                                 │
                                 Estava caída?                      Já avisou? (Redis)
                                        │                                 │
                                   Voltou agora? ──► avisa reconectado    Primeiro aviso? ──► Emite link ──► envia ──► marca (24h)
                                        │                                 │
                                   limpa estado                        senão: silêncio
```

- **`check_only: true`** consulta o status do provider e **não** gera token. É o batimento de
  cada ciclo.
- Caiu e **ainda não avisou** → emite o link, envia, e marca no Redis por 24h (não repete o aviso
  a cada 15 min).
- Voltou e **tinha avisado** → manda um "reconectou" e limpa o estado.
- A **janela de horário** evita mandar aviso de madrugada. Ajuste ou remova o nó `Janela de
  horário?` conforme a sua operação.

---

## Endpoint usado

Os dois nós HTTP chamam a mesma função, `portal-issue-link`, com corpos diferentes:

```jsonc
// Checa status (não emite token)
{ "instance": "SUA_INSTANCIA", "check_only": true }
// → { "status": "connected" | "disconnected" | ..., "label": "..." }

// Emite o link (gera token, revoga o anterior)
{ "instance": "SUA_INSTANCIA" }
// → { "url": "https://.../SUA_INSTANCIA?t=...", "expires_at": "...", "label": "..." }
```

Veja o contrato completo em [`../docs/spec.md`](../docs/spec.md) e o passo a passo de deploy no
[`../README.md`](../README.md).
