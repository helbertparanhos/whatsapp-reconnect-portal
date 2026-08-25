# UI e MVP de Telas — QR Pair Portal
> Fase 4 · 2026-08-24 · versão 1.0
> Implementa: `03-prd.md` · `03-spec.md`

## Premissa que governa tudo

A Sandra abre este link **no celular, com pressa, sem contexto técnico, e provavelmente irritada
porque o WhatsApp do negócio dela parou.** Ela não sabe o que é instância, token, QR versus
pareamento, nem quem é o provider.

Disso decorrem quatro regras que valem para todas as telas:

1. **Nenhuma pergunta que ela não saiba responder.** Sem tela de escolha antes do QR.
2. **Nenhum jargão.** Não aparece "instância", "token", "API", "provider" em lugar nenhum da tela.
3. **Todo estado tem saída.** Nenhuma tela é beco sem saída, nem a de erro.
4. **Mobile é o caso principal.** Desktop é o secundário.

---

## Inventário de telas

O produto é **uma rota com sete estados**, não sete páginas. Navegação entre páginas seria fricção
pura num fluxo de dois minutos.

| ID | Estado / Tela | Rota | Atende | Quem vê |
|---|---|---|---|---|
| TELA-01 | Verificando o link | `/:instanceId?t=` | FR-01 | qualquer um com o link |
| TELA-02 | QR Code (padrão) | mesma | FR-02, FR-03 | link válido, desconectado |
| TELA-03 | Código de pareamento | mesma | FR-05 | quem optou pela alternativa |
| TELA-04 | Renovação pausada | mesma | FR-04, FR-19 | após 3 renovações sem conexão |
| TELA-05 | Conectado | mesma | FR-06, FR-09 | conexão detectada |
| TELA-06 | Link expirado | mesma | FR-08 | token inválido, expirado ou ausente |
| TELA-07 | Erro | mesma | FR-07 | falha de rede ou de provider |

**Telas de sistema** (nenhum FR pede, todo produto precisa):

| ID | Tela | Rota | Observação |
|---|---|---|---|
| TELA-90 | Rota não encontrada | `*` | Substitui o placeholder "Welcome to Your Blank App" (P-14) |
| TELA-91 | Raiz do domínio | `/` | Sem identificador não há o que mostrar. **Não** revela que o serviço existe nem como usá-lo |

> TELA-91 merece atenção. A raiz não pode virar página de marketing nem explicar o funcionamento —
> seria mapa para quem quer sondar o serviço. Mostra apenas uma mensagem neutra de que o acesso é
> por link direto.

**Não existe tela de login, de cadastro, de listagem ou de administração.** É decisão de produto
registrada nos não-objetivos do `02-brainstorm.md`.

---

## Fluxo de navegação

```
                    abre o link
                         │
                         ▼
                  ┌─────────────┐
                  │  TELA-01    │  valida o token + consulta status
                  │ Verificando │
                  └──────┬──────┘
        ┌────────────────┼─────────────────┬──────────────┐
        │                │                 │              │
   token inválido   já conectado      desconectado     falha
        ▼                ▼                 ▼              ▼
  ┌───────────┐   ┌───────────┐     ┌───────────┐  ┌───────────┐
  │ TELA-06   │   │ TELA-05   │     │ TELA-02   │  │ TELA-07   │
  │ Expirado  │   │ Conectado │◄────│ QR Code   │  │   Erro    │
  └───────────┘   └───────────┘     └─────┬─────┘  └─────┬─────┘
     (final)         (final)    detectou   │              │ tentar
                         ▲                 │              └──────┐
                         │      ┌──────────┴──────────┐          │
                         │      │                     │          │
                         │  3 ciclos            "usar código"     │
                         │      ▼                     ▼          │
                         │ ┌───────────┐       ┌───────────┐     │
                         └─│ TELA-04   │       │ TELA-03   │─────┘
                           │  Pausado  │       │Pareamento │
                           └─────┬─────┘       └───────────┘
                                 │ "gerar novo QR"
                                 └──────► TELA-02
```

**Verificação das três condições:**

- ✅ **Toda tela é alcançável.** TELA-03 e TELA-04 saem de TELA-02; as demais saem de TELA-01.
- ✅ **Toda tela tem saída** — inclusive TELA-06 (instrução de como pedir outro link) e TELA-07
  (botão de tentar de novo).
- ✅ **Caminho até o "aha": 2 telas** (TELA-01 → TELA-02 → escaneia → TELA-05). Não dá para
  encurtar: a validação do token é obrigatória e o QR precisa ser pedido ao provider.

O caso mais rápido tem **uma tela só**: instância já conectada vai de TELA-01 direto para TELA-05.

---

## TELA-01 — Verificando o link

**Atende:** FR-01 · **Duração típica:** 1–3s

```
┌────────────────────────────────┐
│                                │
│                                │
│            ( ◠ )               │  ← indicador de carregamento
│                                │
│      Verificando seu link…     │  ← texto, não só spinner
│                                │
│                                │
└────────────────────────────────┘
```

| Estado | O que aparece |
|---|---|
| **Carregando** | É o próprio estado da tela. Texto obrigatório junto do indicador — spinner mudo não informa nada (FR-02) |
| **Vazio** | Não se aplica |
| **Erro** | Falha de rede → TELA-07 com "tentar de novo" |
| **Permissão** | Token inválido/ausente → TELA-06 |

**Consome:** `portal-session({ instance, token })` → `{ label, status, supports_pairing, ... }`
**Responsivo:** centralizado, idêntico em todas as larguras
**Acessibilidade:** `role="status"` + `aria-live="polite"` para leitor de tela anunciar o progresso
**Componentes:** `Loader2` (lucide), texto

---

## TELA-02 — QR Code (o padrão)

**Atende:** FR-02, FR-03 · **É a tela principal do produto**

```
┌────────────────────────────────┐
│                                │
│    Reconectar o WhatsApp       │  ← 20px semibold
│    Clínica Bem Estar           │  ← label da instância (FR-01)
│                                │
│  ┌──────────────────────────┐  │
│  │                          │  │
│  │      ███  ██  ███        │  │
│  │      █ █ ████ █ █        │  │  ← QR: mínimo 256×256 CSS px
│  │      ███  ██  ███        │  │     fundo branco SEMPRE,
│  │      ██ ████  ████       │  │     inclusive no tema escuro
│  │                          │  │
│  └──────────────────────────┘  │
│                                │
│   ⟳ Novo código em 14s         │  ← contador (FR-03)
│                                │
│  Como escanear:                │
│  1. Abra o WhatsApp no celular │
│  2. Toque em ⋮ → Dispositivos  │
│     conectados                 │
│  3. Toque em Conectar          │
│     dispositivo                │
│  4. Aponte para este código    │
│                                │
│  ─────────────────────────────  │
│  Não consegue escanear?        │
│  [  Usar código de 8 dígitos ] │  ← 48px de altura
│                                │
└────────────────────────────────┘
```

**Decisões desta tela:**

- **O QR aparece sem nenhuma pergunta antes.** Era a tela de escolha que existia no produto atual e
  que a Sandra não sabia responder.
- **O contador é elemento obrigatório**, não enfeite. Sem ele a pessoa escaneia um código morto e
  conclui que o sistema não funciona (R-07).
- **O QR tem fundo branco fixo**, mesmo no tema escuro. QR invertido não é lido por muitos
  aparelhos — aqui a legibilidade por câmera vence a consistência visual.
- **A instrução usa o caminho literal do WhatsApp**, não "vá nas configurações".
- **A alternativa de pareamento fica abaixo, na mesma tela** — visível sem rolar, mas
  hierarquicamente secundária.

| Estado | O que aparece |
|---|---|
| **Carregando** | Área do QR com skeleton do tamanho final + "Gerando o código…". Nunca colapsa o layout |
| **Vazio** | Não se aplica — sem QR é erro, não vazio |
| **Erro ao renovar** | **Mantém o QR anterior visível** + aviso "não conseguimos atualizar; toque para tentar" (FR-03) |
| **Erro ao gerar** | → TELA-07 |

**Consome:** `portal-connect({ instance, token, method: "qrcode" })` → `{ qrcode, status, qr_ttl_ms }`
**Ações:** renovação automática a cada ≤20s (máx. 3 ciclos) · "Usar código" → TELA-03
**Responsivo:** 320px → QR ocupa `min(256px, 100vw - 48px)`; ≥768px → card centralizado com 420px
**Acessibilidade:** `<img alt="QR Code para conectar o WhatsApp">` · contador com `aria-live="polite"` e atualização a cada 5s (não a cada 1s, que tagarela no leitor de tela) · instruções em `<ol>` real
**Componentes:** `Card`, `Button`, `Skeleton` + próprios `QrPanel`, `Countdown`, `InstructionList`

---

## TELA-03 — Código de pareamento

**Atende:** FR-05

```
  ANTES de informar o número        DEPOIS de gerar
┌────────────────────────────┐   ┌────────────────────────────┐
│  ← Voltar para o QR Code   │   │  ← Voltar para o QR Code   │
│                            │   │                            │
│  Conectar com o número     │   │  Digite este código no     │
│                            │   │  WhatsApp:                 │
│  Número do WhatsApp        │   │                            │
│  ┌──────────────────────┐  │   │   ┌────────────────────┐   │
│  │ 55 11 99999-9999     │  │   │   │   D4F2 - 8KQ1      │   │  ← 32px mono
│  └──────────────────────┘  │   │   └────────────────────┘   │
│  Com código do país e DDD  │   │                            │
│                            │   │  1. Abra o WhatsApp        │
│  [    Gerar código     ]   │   │  2. ⋮ → Dispositivos       │
│                            │   │     conectados             │
│                            │   │  3. Conectar dispositivo   │
│                            │   │  4. Conectar com número    │
│                            │   │     de telefone            │
│                            │   │  5. Digite o código acima  │
└────────────────────────────┘   └────────────────────────────┘
```

| Estado | O que aparece |
|---|---|
| **Carregando** | Botão vira "Gerando…" e desabilita. O campo **permanece preenchido** |
| **Vazio** | Botão desabilitado enquanto o número não for válido |
| **Erro de validação** | Mensagem sob o campo, borda `destructive`, **sem limpar o que foi digitado** (FR-05) |
| **Erro do provider** | Alerta acima do botão + campo preservado |
| **Indisponível** | Provider sem suporte a pareamento: a entrada para esta tela **não existe** em TELA-02 |

**Consome:** `portal-connect({ ..., method: "paircode", phone })` → `{ paircode, status }`
**Validação:** só dígitos, 10 a 15 — **no front antes de chamar** e de novo na função
**Responsivo:** campo com `inputmode="numeric"` para abrir o teclado numérico no celular
**Acessibilidade:** `<label>` associado · erro com `aria-describedby` e `aria-invalid` · código exibido em bloco com espaçamento de leitura, não texto corrido
**Componentes:** `Card`, `Input`, `Label`, `Button`, `Alert` + próprios `PairPanel`, `PairCodeDisplay`

---

## TELA-04 — Renovação pausada

**Atende:** FR-04, FR-19 · **Aparece após 3 renovações sem conexão**

```
┌────────────────────────────────┐
│    Reconectar o WhatsApp       │
│    Clínica Bem Estar           │
│                                │
│  ┌──────────────────────────┐  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░  │  │  ← QR anterior esmaecido (40%)
│  │  ░░░ QR expirado ░░░░░░  │  │     + rótulo por cima
│  │  ░░░░░░░░░░░░░░░░░░░░░░  │  │
│  └──────────────────────────┘  │
│                                │
│  Pausamos por aqui             │
│  Ninguém leu o código nas      │
│  últimas tentativas. Toque     │
│  abaixo quando estiver com o   │
│  celular em mãos.              │
│                                │
│  [   Gerar novo código    ]    │  ← ação principal, 48px
│                                │
└────────────────────────────────┘
```

**Por que esta tela existe.** É a recomendação do próprio fornecedor (*"caso o usuário não leia o
QRCode após 3 chamadas, interrompa o fluxo e adicione um botão"*) e é a mitigação do R-06 — 720
invocações por hora por aba aberta.

**O tom importa:** "pausamos" e não "tempo esgotado". Não é falha da Sandra, e o texto não pode
soar como repreensão.

| Estado | O que aparece |
|---|---|
| **Carregando** | Botão vira "Gerando…" e desabilita — **dois toques não disparam duas chamadas** (FR-04) |
| **Erro** | Alerta acima do botão; o botão **continua disponível** |

**Ações:** "Gerar novo código" → reinicia o ciclo e volta a TELA-02
**Acessibilidade:** o QR esmaecido recebe `aria-hidden="true"` — é decorativo agora; o texto é que informa

---

## TELA-05 — Conectado

**Atende:** FR-06, FR-09 · **É o momento "aha"**

```
┌────────────────────────────────┐
│                                │
│           ┌─────┐              │
│           │  ✓  │              │  ← círculo success, 64px
│           └─────┘              │
│                                │
│     WhatsApp conectado!        │  ← 22px semibold
│                                │
│     Clínica Bem Estar está     │
│     de volta ao ar. Você já    │
│     pode fechar esta página.   │
│                                │
└────────────────────────────────┘
```

Estado final. **Sem botões** — não há próximo passo, e oferecer um seria inventar trabalho.

**O ícone ✓ acompanha o texto**, nunca só a cor verde: cor não pode ser a única portadora da
informação.

Quando chega aqui por FR-09 (já estava conectada), o texto muda para *"já está conectado"* — dizer
"conectado!" para quem não fez nada confunde.

**Acessibilidade:** `role="status"` + `aria-live="assertive"` — é a informação mais importante do
fluxo e precisa ser anunciada na hora

---

## TELA-06 — Link expirado

**Atende:** FR-08

```
┌────────────────────────────────┐
│           ┌─────┐              │
│           │  ⏱  │              │  ← neutro, NÃO vermelho
│           └─────┘              │
│                                │
│      Este link expirou         │
│                                │
│   Links de reconexão valem     │
│   por poucas horas, por        │
│   segurança.                   │
│                                │
│   Peça um link novo para       │
│   quem cuida do seu WhatsApp   │
│   e tente de novo.             │
│                                │
└────────────────────────────────┘
```

**Três decisões:**

- **Ícone de relógio, não de erro.** Link expirado é comportamento normal e esperado — tratar como
  falha assusta sem motivo.
- **Explica que a validade curta é proposital.** Vira sinal de cuidado, não de defeito.
- **Mesma tela para expirado, inválido e ausente** — e para instância inexistente. Diferenciar
  permitiria enumerar instâncias (SEC-03).

Estado final, sem ação — a Sandra genuinamente não tem o que fazer aqui além de pedir outro link.

---

## TELA-07 — Erro

**Atende:** FR-07

```
┌────────────────────────────────┐
│           ┌─────┐              │
│           │  !  │              │  ← destructive
│           └─────┘              │
│                                │
│   Não conseguimos gerar o      │
│   código agora                 │
│                                │
│   O serviço de WhatsApp não    │  ← causa, em português
│   respondeu. Isso costuma ser  │
│   temporário.                  │
│                                │
│   [    Tentar de novo     ]    │  ← SEMPRE presente
│                                │
└────────────────────────────────┘
```

**Mensagem por código de erro** — o vocabulário fechado do `03-spec.md`:

| Código | Título | Causa mostrada |
|---|---|---|
| `provider_error` | Não conseguimos gerar o código agora | O serviço de WhatsApp não respondeu. Costuma ser temporário. |
| `rate_limited` | Muitas tentativas | Aguarde alguns minutos antes de tentar de novo. |
| `config_error` | Esta conexão precisa de ajuste | Avise quem cuida do seu WhatsApp — há algo a corrigir no cadastro. |
| `already_connected` | — | Não mostra erro: vai para TELA-05 |
| `invalid_phone` | — | Não vem para cá: erro de campo, tratado em TELA-03 |
| *desconhecido* | Algo deu errado | Tente de novo. Se continuar, avise quem cuida do seu WhatsApp. |

**Nenhuma mensagem expõe URL, credencial, nome de tabela ou stack trace** (SEC-10). O detalhe
técnico vai só para o log.

**Todo erro tem "Tentar de novo"** — inclusive o desconhecido. Tela sem ação é beco sem saída.

---

## TELA-90 / TELA-91 — Telas de sistema

**TELA-90 — Rota não encontrada** (`*`): "Página não encontrada. Verifique se o link foi copiado
por inteiro." Sem link para a raiz — não há para onde ir.

**TELA-91 — Raiz** (`/`): "Esta página é acessada por um link direto. Se você precisa reconectar um
WhatsApp, peça o link a quem cuida da sua conta." **Não explica o funcionamento, não lista nada,
não tem formulário.** Reduzir a superfície informativa da raiz é decisão de segurança.

---

## Design system

### Tokens

```css
:root {
  --background: 0 0% 100%;          --foreground: 215 28% 17%;
  --card: 0 0% 100%;                --card-foreground: 215 28% 17%;
  --muted: 210 40% 96%;             --muted-foreground: 215 16% 42%;
  --primary: 158 84% 26%;           --primary-foreground: 0 0% 100%;
  --success: 158 84% 26%;           --warning-fg: 32 95% 26%;
  --destructive: 0 72% 41%;         --destructive-foreground: 0 0% 100%;
  --border: 214 32% 88%;            /* divisor decorativo */
  --input: 215 20% 55%;             /* BORDA DE CAMPO — regra 1.4.11 */
  --ring: 158 84% 26%;              /* anel de foco */
  --radius: 0.75rem;
}

.dark {
  --background: 215 28% 11%;        --foreground: 210 40% 98%;
  --card: 215 28% 15%;              --card-foreground: 210 40% 98%;
  --muted: 215 28% 18%;             --muted-foreground: 215 20% 70%;
  --primary: 158 64% 52%;           --primary-foreground: 215 28% 11%;
  --success: 158 64% 52%;           --warning-fg: 38 92% 62%;
  --destructive: 0 72% 62%;         --destructive-foreground: 215 28% 11%;
  --border: 215 20% 24%;
  --input: 215 20% 45%;
  --ring: 158 64% 52%;
}
```

**Verde como primária** carrega a semântica de "conectado", que é o objetivo da tela. Mas o layout
é deliberadamente **distinto do WhatsApp** — a página não pode parecer ser o WhatsApp. A confiança
vem do nome da instância (FR-01), não de imitar marca alheia; imitar seria o padrão visual de
phishing.

### Contraste — medido, não estimado

| Par | Claro | Escuro | Mín. | AA |
|---|---|---|---|---|
| `foreground` / `background` | 14.62 | 16.57 | 4.5 | ✅ |
| `muted-foreground` / `background` | 5.65 | 7.89 | 4.5 | ✅ |
| `foreground` / `card` | 14.62 | 14.85 | 4.5 | ✅ |
| `muted-foreground` / `muted` | 5.15 | 6.43 | 4.5 | ✅ |
| `primary-foreground` / `primary` | 5.36 | 9.04 | 4.5 | ✅ |
| `primary` / `background` | 5.36 | 9.04 | 3.0 | ✅ |
| `destructive-foreground` / `destructive` | 6.70 | 4.83 | 4.5 | ✅ |
| `destructive` / `background` | 6.70 | 4.83 | 4.5 | ✅ |
| `success` / `background` | 5.36 | 9.04 | 3.0 | ✅ |
| `warning-fg` / `background` | 7.43 | 9.70 | 4.5 | ✅ |
| **`input` / `background`** | **3.60** | **3.38** | **3.0** | ✅ |
| **`ring` / `background`** | **5.36** | **9.04** | **3.0** | ✅ |

**12 de 12 pares em AA, nos dois temas.**

> **Por que `border` e `input` são tokens separados.** Na primeira medição o token único reprovou
> (1.34 claro / 1.53 escuro). Divisor decorativo pode ser sutil — não carrega informação. Mas
> **borda de campo de formulário identifica o limite do componente** e cai na regra 1.4.11, que
> exige 3:1. Manter um token só forçaria escolher entre divisor pesado demais ou campo
> inacessível. São dois papéis diferentes: dois tokens.

### Tipografia

Fonte do sistema — sem webfont. Elimina requisição de rede e o salto de layout durante o
carregamento, num produto em que os primeiros segundos são tudo.

```css
font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

| Uso | Tamanho | Peso |
|---|---|---|
| Título da tela | 20–22px | 600 |
| Nome da instância | 15px | 400, `muted-foreground` |
| Corpo e instruções | 15px | 400 (**não 14px** — é lido no sol, no celular) |
| Contador do QR | 14px | 500 |
| **Código de pareamento** | **32px** | 700, `ui-monospace`, `letter-spacing: .1em` |
| Auxiliar | 13px | 400 |

### Espaçamento, alvos e foco

- Escala de 4px · raio `0.75rem` (mais suave que o padrão: reduz a aparência de alerta)
- **Todo alvo de toque ≥ 48px de altura** — acima dos 44px exigidos, porque a mão treme com pressa
- Espaço vertical mínimo de 8px entre alvos adjacentes
- **Foco:** `ring` de 2px com deslocamento de 2px, sempre visível. Nunca `outline: none` sem
  substituto

### Tema escuro

Decidido agora, não depois — retrofitar dark mode com os componentes prontos custa muito mais.
Segue `prefers-color-scheme`, **sem alternador manual**: a Sandra abre a página uma vez e não vem
configurar tema.

**Exceção única e obrigatória:** o QR mantém fundo branco nos dois temas.

---

## Inventário de componentes

**shadcn/ui — instalar apenas estes 5:**

```
npx shadcn@latest add button card input label alert
```

Os outros 47 componentes hoje instalados saem do repositório na TASK-01 (P-17).

**Próprios (construir):**

| Componente | Onde mora | Usado em | Complexidade |
|---|---|---|---|
| `QrPanel` | `features/connect/components/` | TELA-02, TELA-04 | M |
| `Countdown` | `features/connect/components/` | TELA-02 | P |
| `PairPanel` | `features/connect/components/` | TELA-03 | M |
| `PairCodeDisplay` | `features/connect/components/` | TELA-03 | P |
| `InstructionList` | `features/connect/components/` | TELA-02, TELA-03 | P |
| `SuccessPanel` | `features/connect/components/` | TELA-05 | P |
| `ExpiredPanel` | `features/connect/components/` | TELA-06 | P |
| `ErrorNotice` | `features/connect/components/` | TELA-07 e inline | P |
| `StatusIcon` | `features/connect/components/` | TELA-05, 06, 07 | P |

**Layout:** nenhum. Não há shell, cabeçalho, menu nem rodapé — a página é um card centralizado.
Cada elemento de navegação seria uma saída que a Sandra não deve tomar no meio do fluxo.

---

## Mapa FR → Tela → Componentes

| FR | Telas | Componentes próprios | Tasks |
|---|---|---|---|
| FR-01 | TELA-01, TELA-02 | — | TASK-17 |
| FR-02 | TELA-02 | `QrPanel`, `InstructionList` | TASK-18 |
| FR-03 | TELA-02 | `QrPanel`, `Countdown` | TASK-18 |
| FR-04 | TELA-04 | `QrPanel` | TASK-18 |
| FR-05 | TELA-03 | `PairPanel`, `PairCodeDisplay`, `InstructionList` | TASK-19 |
| FR-06 | TELA-05 | `SuccessPanel` | TASK-20, TASK-21 |
| FR-07 | TELA-07 | `ErrorNotice`, `StatusIcon` | TASK-16 |
| FR-08 | TELA-06 | `ExpiredPanel`, `StatusIcon` | TASK-17 |
| FR-09 | TELA-05 | `SuccessPanel` | TASK-21 |
| FR-10 | todas | todos | TASK-22 |
| FR-19 | TELA-04 | `QrPanel` | TASK-20 |
| — | TELA-90, TELA-91 | — | **TASK-27** (nova) |

---

## Ajuste em `03-tasks.md`

As telas de sistema não tinham task. Adicionada:

**TASK-27 [FR-20, infra] — Telas de sistema** · Onda 2 · **P**
Substitui o placeholder da raiz e a página de rota inexistente. A raiz **não** explica o
funcionamento do serviço nem lista nada — decisão de segurança registrada aqui.
*Depende de:* TASK-17 · *Verificação:* `/` e uma rota aleatória renderizam as telas corretas, sem
vazar informação sobre o serviço.

Total de tasks: **26 → 27**.
