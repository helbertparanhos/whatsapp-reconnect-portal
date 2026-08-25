# PRD — QR Pair Portal
> Fase 3 · 2026-08-24 · versão 1.0 · formato Completo

## O problema

Quando o WhatsApp de um negócio cai, quem precisa reconectar é o dono do número — mas a ferramenta
para isso é o painel do provider, que exige a credencial mestra e expõe todas as outras contas. Na
prática o dono não reconecta sozinho: ele descobre a queda por reclamação de cliente, aciona o
suporte, e alguém conduz a reconexão por chamada, lendo QR Code que expira em 20 segundos. Enquanto
isso, o canal de vendas está fora do ar.

## A solução em uma frase

Um link de uso temporário, escopado a uma única instância, que o dono do número abre no celular e
reconecta sozinho em menos de dois minutos — qualquer que seja o provider por trás.

## Contexto de mercado

Ver `01-pesquisa.md`. Em resumo: **não existe concorrente direto**. Todo painel do mercado —
Evolution Manager, painel Z-API, painel UAZAPI, e os gateways self-hosted — autentica no nível da
**conta ou da master key**, nunca no nível da instância. Isso torna impossível entregar acesso ao
cliente final sem expor os demais.

As três lacunas exploradas:
1. Autorização por instância, com validade curta
2. Provider-agnóstico real (parque misto é a norma, não a exceção)
3. Interface para não-técnico, no celular

## Personas

- **Sandra** (dona do negócio — PRINCIPAL) — não é técnica, está no celular, com pressa, e perde
  venda enquanto o número está fora do ar.
- **Marcos** (operador do parque) — administra dezenas de instâncias em três providers; não tem
  visão única e não pode dar o painel para o cliente.
- **Rafa** (adotante do open source) — tem o mesmo problema e precisa avaliar o projeto em 10 minutos.
- **Bia** (suporte) — recebe "não funcionou" e hoje investiga às cegas, sem nenhum registro.

## Jornadas do usuário

### Sandra — reconectar o próprio WhatsApp

1. A automação detecta a queda e manda mensagem no grupo com o link → atende **FR-14**
2. Ela toca no link; a página abre e mostra o nome da instância dela → atende **FR-01**
3. O QR aparece direto, sem perguntar nada, com contador de segundos → atende **FR-02**, **FR-03**
4. Ela escaneia com o celular
5. A página detecta e mostra "WhatsApp conectado" → atende **FR-06** ← **momento "aha"**

Caminhos alternativos:
- Não consegue escanear → usa código de pareamento na mesma tela → **FR-05**
- QR expirou 3 vezes sem leitura → botão "gerar novo QR" → **FR-04**, **FR-19**
- Já tinha reconectado sozinha → página avisa, sem mostrar QR inútil → **FR-09**
- Link velho → página explica que expirou e como conseguir outro → **FR-08**
- Provider fora do ar → erro com causa e próximo passo → **FR-07**

---

## Requisitos funcionais

### FR-01 — Abrir o link e reconhecer a própria instância
**Como** Sandra, **quero** ver o nome da minha instância assim que abro o link, **para** ter certeza
de que é legítimo e é o meu número.

**Critérios de aceite:**
- [ ] Ao abrir a URL com identificador e token válidos, o nome da instância aparece sem nenhuma ação
- [ ] Nenhum dado de outra instância aparece na tela ou na resposta da API
- [ ] Token ausente, inválido ou expirado: mostra a tela de link expirado (FR-08), nunca o nome
- [ ] Identificador inexistente: mesma resposta de token inválido, sem revelar se a instância existe
- [ ] Falha de rede ao validar: mostra erro com botão "tentar de novo", nunca tela em branco

**Prioridade:** Must · **Origem:** brainstorm §Musts (4), lacuna de mercado 1

---

### FR-02 — Ver o QR Code já na primeira tela
**Como** Sandra, **quero** o QR Code direto, **para** não precisar escolher entre opções que não sei
diferenciar.

**Critérios de aceite:**
- [ ] Com o link válido e a instância desconectada, o QR é solicitado automaticamente
- [ ] Não existe tela intermediária perguntando o método de conexão
- [ ] O código de pareamento é oferecido na mesma tela, como alternativa secundária
- [ ] Enquanto o QR carrega, mostra estado de carregamento com texto, não só um spinner
- [ ] Provider não devolve QR: mostra erro com causa e o botão de tentar de novo (FR-07)

**Prioridade:** Must · **Origem:** brainstorm §Jornada — corte de um passo inteiro

---

### FR-03 — Ver o QR renovar sozinho, com contador
**Como** Sandra, **quero** saber quanto tempo o QR ainda vale e vê-lo renovar sozinho, **para** não
escanear um código morto sem saber.

**Critérios de aceite:**
- [ ] A tela exibe um contador regressivo visível do tempo restante do QR
- [ ] O QR é renovado automaticamente antes de expirar, no máximo a cada 20 segundos
- [ ] Ao renovar, a imagem troca e o contador reinicia, sem recarregar a página
- [ ] A renovação automática para após 3 ciclos sem conexão (ver FR-04)
- [ ] Falha ao renovar: mantém o QR anterior visível e mostra aviso de que não conseguiu renovar

**Prioridade:** Must · **Origem:** limite documentado do WhatsApp (20s) + recomendação do fornecedor

---

### FR-04 — Pedir um QR novo depois da parada automática
**Como** Sandra, **quero** um botão para gerar outro QR, **para** retomar quando estiver pronta.

**Critérios de aceite:**
- [ ] Após 3 renovações automáticas sem conexão, a renovação para e aparece o botão "gerar novo QR"
- [ ] A mensagem explica que parou para não gastar à toa, e que é só tocar para continuar
- [ ] O botão reinicia o ciclo de 3 renovações
- [ ] Enquanto gera, o botão fica desabilitado — dois toques não disparam duas chamadas
- [ ] Falha ao gerar: mostra o erro e mantém o botão disponível

**Prioridade:** Must · **Origem:** recomendação do fornecedor + mitigação de R-06

---

### FR-05 — Conectar por código de pareamento
**Como** Sandra, **quero** usar um código em vez do QR, **para** conseguir conectar quando não posso
escanear (por exemplo, é o mesmo celular).

**Critérios de aceite:**
- [ ] A opção fica visível na tela do QR, sem navegação para outra página
- [ ] O campo de telefone aceita apenas dígitos e exige o formato internacional com DDI
- [ ] Número com menos de 10 ou mais de 15 dígitos é recusado antes de chamar a API, com mensagem clara
- [ ] O código recebido é exibido em fonte grande, legível, com o passo a passo dentro do WhatsApp
- [ ] Provider que não suporta pareamento: a opção não aparece para aquela instância
- [ ] Falha ao gerar: mostra o erro e mantém o telefone digitado, sem limpar o campo

**Prioridade:** Must · **Origem:** brainstorm §Musts (7, 10)

---

### FR-06 — Saber que conectou, sem atualizar a página
**Como** Sandra, **quero** ver a confirmação sozinha, **para** ter certeza de que terminei.

**Critérios de aceite:**
- [ ] A página consulta o status periodicamente enquanto aguarda conexão
- [ ] Ao detectar conexão, mostra a tela de sucesso em no máximo 10 segundos
- [ ] A tela de sucesso diz o nome da instância e que a página pode ser fechada
- [ ] Ao conectar, a consulta periódica para imediatamente
- [ ] Erro na consulta não derruba a tela nem interrompe o fluxo: registra e tenta de novo até o teto

**Prioridade:** Must · **Origem:** expectativa de mercado + correção de R-01

---

### FR-07 — Entender por que não funcionou
**Como** Sandra, **quero** saber o que deu errado em português, **para** decidir se tento de novo ou
peço ajuda.

**Critérios de aceite:**
- [ ] Toda falha exibe uma mensagem com causa e próximo passo — nunca "erro" genérico
- [ ] Erro do provider, erro de rede e erro de configuração produzem mensagens diferentes
- [ ] A mensagem nunca expõe URL interna, credencial, nome de tabela ou stack trace
- [ ] Toda tela de erro tem uma ação: tentar de novo, ou instrução de como pedir ajuda
- [ ] Nenhuma falha é silenciosa: erro engolido sem exibição é violação deste requisito

**Prioridade:** Must · **Origem:** R-02 — foi o silêncio que escondeu R-01 em produção

---

### FR-08 — Saber que o link expirou e como conseguir outro
**Como** Sandra, **quero** entender que o link venceu, **para** não achar que o sistema quebrou.

**Critérios de aceite:**
- [ ] Token expirado, inválido ou ausente leva à mesma tela, com o mesmo texto
- [ ] O texto explica que links têm validade curta por segurança e como solicitar um novo
- [ ] A tela não revela se o identificador da instância existe
- [ ] Não há QR, nem botão de reconexão, nesta tela

**Prioridade:** Must · **Origem:** brainstorm §Musts (13)

---

### FR-09 — Descobrir que já estava conectado
**Como** Sandra, **quero** ser avisada de que já está tudo certo, **para** não perder tempo com um
QR desnecessário.

**Critérios de aceite:**
- [ ] Ao abrir o link, o status é verificado antes de solicitar qualquer QR
- [ ] Instância já conectada: mostra a tela de sucesso, sem gerar QR nem chamar o endpoint de conexão
- [ ] Se conectar durante a espera, a tela troca para sucesso sem ação do usuário
- [ ] Falha ao verificar o status: segue para o fluxo normal de QR, sem travar

**Prioridade:** Must · **Origem:** comportamento documentado dos providers (recusam reconexão quando conectados)

---

### FR-10 — Usar tudo no celular, sem instalar nada
**Como** Sandra, **quero** que funcione bem no navegador do celular, **para** resolver onde eu estiver.

**Critérios de aceite:**
- [ ] Layout legível e utilizável a partir de 320px de largura
- [ ] Alvos de toque com pelo menos 44×44px
- [ ] O QR ocupa área suficiente para leitura por outro aparelho a ~20cm
- [ ] Contraste mínimo AA em todo texto
- [ ] Navegável por teclado, com foco visível
- [ ] Funciona sem instalar nada e sem login

**Prioridade:** Must · **Origem:** persona principal + brainstorm §Musts (17)

---

### FR-11 — Resolver o provider a partir da instância
**Como** sistema, **quero** descobrir o provider pela própria instância, **para** que a mesma URL
sirva a qualquer provider.

**Critérios de aceite:**
- [ ] O provider é lido de um campo obrigatório e restrito a valores conhecidos
- [ ] Não existe variável de ambiente global definindo o provider
- [ ] Instância com provider desconhecido é recusada com erro de configuração, não tentativa às cegas
- [ ] Adicionar um provider novo não exige alterar quem chama o adapter

**Prioridade:** Must · **Origem:** R-03, R-04

---

### FR-12 — Falar com os três providers por uma interface única
**Como** sistema, **quero** uma interface comum de conectar/status, **para** que a tela não conheça
diferença entre providers.

**Critérios de aceite:**
- [ ] Existe uma operação de conexão e uma de status, iguais para os três providers
- [ ] A resposta é normalizada: um formato só de QR, de código e de status
- [ ] O status normalizado assume apenas os valores `connected`, `connecting` e `disconnected`
- [ ] Cada provider tem teste de contrato que valida sua tradução de entrada e de saída
- [ ] Provider indisponível produz erro identificável, distinto de credencial inválida

**Prioridade:** Must · **Origem:** R-03 — os três divergem em path, header, verbo e nome de campo

---

### FR-13 — Nunca expor credencial de provider ao navegador
**Como** sistema, **quero** que a credencial só exista no servidor, **para** que ninguém a extraia
do cliente.

**Critérios de aceite:**
- [ ] Nenhuma resposta de API inclui credencial, host interno ou identificador interno da instância
- [ ] Nenhuma credencial aparece no bundle publicado
- [ ] O navegador conhece apenas o identificador público da instância e o token do link
- [ ] Existe verificação automatizada que falha o build se um segredo conhecido aparecer no bundle

**Prioridade:** Must · **Origem:** pior cenário nº 1 — é a única parte do desenho atual que já está correta

---

### FR-14 — Emitir link de reconexão sob demanda
**Como** Marcos (via automação), **quero** pedir um link só quando a instância cai, **para** que não
existam links válidos parados.

**Critérios de aceite:**
- [ ] A emissão exige um segredo próprio no cabeçalho; sem ele responde 401
- [ ] A emissão recebe o identificador da instância e devolve a URL completa e a validade
- [ ] Emitir para uma instância revoga o token anterior dela
- [ ] Instância inativa ou sem credencial utilizável: recusa a emissão e explica o motivo
- [ ] Toda emissão é registrada na auditoria
- [ ] O token em claro é devolvido uma única vez, na resposta da emissão, e não é recuperável depois

**Prioridade:** Must · **Origem:** decisão de arquitetura (ADR-003) — substitui a rotação em lote

---

### FR-15 — Guardar o token de forma irreversível
**Como** sistema, **quero** que um vazamento da tabela não entregue links válidos, **para** limitar
o dano de um incidente.

**Critérios de aceite:**
- [ ] O banco guarda apenas o hash do token, nunca o valor em claro
- [ ] A validação compara hashes, em tempo constante
- [ ] O token tem no mínimo 128 bits de entropia, de gerador criptográfico
- [ ] Consultar diretamente a tabela não permite reconstruir nenhum link

**Prioridade:** Must · **Origem:** P-07, pior cenário nº 1

---

### FR-16 — Limitar tentativas por origem e por instância
**Como** sistema, **quero** barrar volume anormal, **para** que ninguém varra tokens nem gere custo.

**Critérios de aceite:**
- [ ] Tentativas com token inválido são contadas por origem e por instância
- [ ] Ultrapassado o limite da janela, responde 429 com indicação de quando tentar de novo
- [ ] O limite não bloqueia o uso legítimo: uma sessão de reconexão normal nunca atinge o teto
- [ ] Requisição bloqueada é registrada na auditoria com o desfecho correspondente
- [ ] O bloqueio expira sozinho ao fim da janela, sem intervenção

**Prioridade:** Must · **Origem:** R-06, P-03

---

### FR-17 — Aceitar chamadas apenas das origens configuradas
**Como** sistema, **quero** restringir as origens, **para** reduzir a superfície de abuso.

**Critérios de aceite:**
- [ ] As origens permitidas vêm de configuração, não do código
- [ ] Origem não listada recebe resposta sem cabeçalhos de liberação
- [ ] A configuração padrão do projeto não é curinga
- [ ] A documentação explica como configurar em desenvolvimento e em produção

**Prioridade:** Must · **Origem:** P-02

---

### FR-18 — Registrar cada acesso para investigação
**Como** Bia, **quero** consultar o que aconteceu com um link, **para** responder "não funcionou"
com fato.

**Critérios de aceite:**
- [ ] Toda chamada registra: instância, ação, desfecho, data/hora e origem hasheada
- [ ] O IP é gravado apenas como hash com sal; nunca em claro
- [ ] O registro nunca contém token em claro, credencial ou telefone
- [ ] Falha ao registrar não derruba a requisição do usuário
- [ ] É possível responder, por consulta: o link foi aberto? quando? qual foi o desfecho?

**Prioridade:** Must · **Origem:** P-06, persona Bia

---

### FR-19 — Interromper o polling e avisar
**Como** sistema, **quero** parar de consultar depois de um tempo, **para** não gastar cota com aba
esquecida.

**Critérios de aceite:**
- [ ] A consulta periódica para após no máximo 5 minutos sem conexão
- [ ] Ao parar, a tela informa e oferece o botão de retomar
- [ ] Sair da aba (aba em segundo plano) pausa a consulta; voltar retoma
- [ ] Nenhum caminho da aplicação consulta indefinidamente

**Prioridade:** Must · **Origem:** R-06 — 720 invocações/hora por aba aberta

---

### FR-20 — Rodar do zero em qualquer projeto Supabase
**Como** Rafa, **quero** clonar e subir sem adivinhar nada, **para** avaliar o projeto rapidamente.

**Critérios de aceite:**
- [ ] `.env.example` lista toda variável necessária, com descrição e exemplo
- [ ] As migrations criam todo o schema num projeto vazio, em ordem, sem erro
- [ ] O README leva de clone a aplicação rodando, com os comandos exatos
- [ ] Nenhum identificador, nome, URL ou dado da operação de origem aparece em qualquer arquivo
- [ ] Existe LICENSE e guia de contribuição
- [ ] Os testes de contrato rodam contra os três providers com credenciais do próprio adotante

**Prioridade:** Must · **Origem:** objetivo declarado do projeto

---

### FR-21 — Eliminar registros de auditoria antigos
**Como** responsável pelo tratamento, **quero** que o log seja apagado sozinho, **para** cumprir a
retenção declarada.

**Critérios de aceite:**
- [ ] Registros com mais de 90 dias são eliminados automaticamente
- [ ] A rotina é versionada em migration, não configurada só no painel
- [ ] A retenção está documentada no README e no PRD
- [ ] A eliminação é definitiva, não marcação lógica

**Prioridade:** Must · **Origem:** LGPD art. 16 — retenção implementada, não só declarada

---

## Requisitos não-funcionais

| ID | Categoria | Requisito | Como medir |
|---|---|---|---|
| RNF-01 | Performance | Primeira renderização útil em até 2s em 4G | Lighthouse mobile, FCP < 2s |
| RNF-02 | Performance | O QR aparece em até 3s após abrir o link válido | Medição da rota completa |
| RNF-03 | Segurança | Toda tabela com RLS habilitado e policy explícita | Consulta a `pg_policies` no CI |
| RNF-04 | Segurança | Nenhum segredo no bundle publicado | Varredura do `dist/` no CI |
| RNF-05 | Segurança | Token com validade máxima de 2 horas | Verificação no código de emissão |
| RNF-06 | Acessibilidade | Contraste AA; navegável por teclado; alvo ≥44px | axe + revisão manual |
| RNF-07 | Observabilidade | Todo erro de servidor com identificador de correlação | Presente em 100% das respostas 5xx |
| RNF-08 | Custo | Consumo de Edge Functions abaixo de 100 mil/mês | Painel de uso |
| RNF-09 | LGPD | Nenhum dado pessoal em claro; IP só hasheado | Revisão de schema |
| RNF-10 | LGPD | Telefone do pareamento não é persistido em lugar nenhum | Revisão de código + auditoria |
| RNF-11 | Compatibilidade | Funciona nas duas últimas versões de Chrome, Safari e Firefox | Teste manual |
| RNF-12 | Manutenção | Cobertura de teste dos adapters e da validação de token ≥80% | Relatório do runner |

### Nota de LGPD

O sistema **não guarda dado pessoal em claro**. O que trafega e o que fica:

| Dado | Trafega | Persiste | Base |
|---|---|---|---|
| Nome da instância | sim | sim | Dado de pessoa jurídica, não pessoal |
| Telefone (pareamento) | sim | **não** | Repassado ao provider e descartado — RNF-10 |
| IP de quem abre | sim | **só hash com sal** | Legítimo interesse: detecção de abuso — 90 dias |
| Token do link | sim | **só hash** | Credencial, não dado pessoal |

Por não haver titular identificável armazenado, **não há FR de portabilidade nem de eliminação a
pedido do titular** — não existe conta de pessoa física neste sistema. Caso um adotante do open
source associe instâncias a pessoas físicas, a documentação alerta que essa avaliação passa a ser
responsabilidade dele.

---

## Escopo por release

| Release | Requisitos | Objetivo |
|---|---|---|
| **Onda 1 — Não mentir** | FR-07, FR-08, FR-11, FR-14, FR-19 + infra | Parar de falhar em silêncio e emitir link com segurança |
| **Onda 2 — Falar com todos** | FR-01…FR-06, FR-09, FR-10, FR-12 | O produto em si: os três providers e a tela nova |
| **Onda 3 — Publicável** | FR-13, FR-15…FR-18, FR-20, FR-21 | Endurecimento e documentação. **Autoriza a publicação** |

---

## Considerações de design (vinculam a fase 4)

- **Mobile-first, não mobile-também.** O desktop é o caso secundário.
- **Uma tela, vários estados** — carregando, QR, pareamento, sucesso, expirado, erro, parado.
  Não há navegação entre páginas.
- Nenhuma tela intermediária de escolha antes do QR.
- Texto em português, sem jargão: nada de "instância", "token", "API" para a Sandra.
- Instruções com o caminho literal dentro do WhatsApp.
- O contador de expiração do QR é elemento obrigatório, não enfeite.

## Considerações técnicas (vinculam a spec)

- Três providers com autenticação, verbo e formato de resposta diferentes — adapter obrigatório.
- Nenhuma tabela existente pode ser criada, alterada ou renomeada.
- Supabase Pro é obrigatório: o plano Free pausa após 1 semana de inatividade (ADR-001).
- A emissão de link é protegida por segredo próprio, não por JWT (a função roda sem verificação).
- Nenhum identificador da operação de origem em qualquer arquivo versionado.

## Riscos e mitigações

| ID | Risco | Prob. | Impacto | Mitigação | FR |
|---|---|---|---|---|---|
| R-01 | Endpoint de status errado (confirmado) | — | alto | Adapter + teste de contrato | FR-12 |
| R-02 | Erro engolido em silêncio | — | alto | Proibição de falha silenciosa | FR-07 |
| R-03 | Três providers, não dois | — | alto | Adapter com três implementações | FR-11, FR-12 |
| R-05 | 71% das instâncias não conectam | — | alto | Resolvido pelo multi-provider | FR-11 |
| R-06 | Polling ilimitado estoura cota | alta | médio | Teto de tentativas e de renovação | FR-04, FR-19 |
| R-07 | QR expira sem aviso | alta | alto | Contador + renovação automática | FR-03 |
| R-08 | Rotação sem autenticação | — | alto | Segredo próprio na emissão | FR-14 |
| R-09 | Cron fora de migration | — | médio | Rotina versionada | FR-21 |
| R-11 | Instância caída não avisa sobre si | — | alto | Instância notificadora dedicada | fase 7 |
| R-12 | Chamador do sub-fluxo não localizado | média | alto | Mapear antes de desativar | fase 7 |
| R-13 | Credencial hardcoded em automação | — | crítico | Rotação + credential store | fase 7 |

## Dependências externas

| Dependência | Tipo | Bloqueia | Status |
|---|---|---|---|
| Plano Supabase Pro | assinatura | FR-20 em produção | a confirmar |
| Credenciais dos 3 providers para teste | credencial | FR-12 (contrato) | disponíveis |
| Instância notificadora dedicada | infra | automação (fase 7) | **a confirmar** |
| Mapa dos consumidores das tabelas | investigação | automação (fase 7) | **pendente** |
| Segredo de emissão | configuração | FR-14 | a criar |

## Métricas de sucesso

Framework: **HEART**, por ser produto de tarefa única com sucesso binário.

| Dimensão | Métrica | Baseline | Meta |
|---|---|---|---|
| Sucesso de tarefa | Reconexões concluídas sem suporte | 0% (portal não funciona para 71%) | ≥80% |
| Sucesso de tarefa | Tempo mediano do link aberto até conectado | não medido | <2 min |
| Adoção | Instâncias do parque atendidas pelo portal | 29% (4 de 14) | 100% |
| Felicidade | Chamados de suporte sobre reconexão | não medido | queda ≥70% |
| Engajamento | Links abertos / links enviados | não medido | ≥70% |

## Perguntas em aberto

- [ ] A instância notificadora dedicada já existe e está estável? — bloqueia: automação (fase 7)
- [ ] As 6 instâncias sem identificador devem virar inativas? — bloqueia: sincronização (fase 7)
- [ ] O plano Supabase já é Pro? — bloqueia: FR-20 em produção

Nenhuma bloqueia a fase 4 nem o início da fase 5.
