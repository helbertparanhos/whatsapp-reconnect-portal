# ADR-003 — Emitir o link sob demanda, não por rotação em lote

- **Status:** aceita
- **Data:** 2026-08-24
- **Decide:** mantenedor
- **Relacionado:** FR-14, FR-15, R-08, SEC-06
- **Substitui:** o comportamento da função `generate-tokens` do sistema atual

## Contexto

O sistema atual roda um cron a cada 2 horas que **rotaciona o token de todas as instâncias ativas**,
conectadas ou não. Verificado em produção: o agendamento existe, está ativo, e mantém 14 tokens
válidos permanentemente.

Consequências do desenho atual:

- **Existem sempre 14 links de reconexão válidos**, 24 horas por dia, mesmo quando todas as
  instâncias estão conectadas e ninguém precisa de link nenhum
- Um dump da tabela entrega acesso a todas as instâncias por até 2 horas
- A função de rotação roda **sem autenticação nenhuma** (`verify_jwt = false` e nenhuma verificação
  própria): um request na URL invalida todos os links já enviados aos clientes — DoS de uma linha
- A rotação é cega: não sabe se a instância tem credencial utilizável

## Alternativas consideradas

### A) Emissão sob demanda, disparada pela detecção de queda
- ✅ O token só existe enquanto alguém precisa dele
- ✅ Superfície de exposição cai de "sempre" para "durante um incidente"
- ✅ Permite recusar a emissão quando a instância está inativa ou sem credencial
- ❌ Exige que a automação peça o token, em vez de ler um pronto — muda o fluxo do n8n

### B) Manter a rotação em lote
- ✅ Já funciona, zero trabalho
- ❌ Mantém todos os problemas acima

### C) Sob demanda com validade curta (15-30 min)
- ✅ Superfície ainda menor
- ❌ Se o cliente demorar para abrir o WhatsApp — que é o caso comum — o link morre e ele precisa
  pedir outro, gerando exatamente a fricção que o produto existe para eliminar

## Decisão

**Escolhemos A, com validade de até 2 horas e token multiuso dentro da janela.**

A janela de 2 horas é mantida porque o gargalo real é humano: a pessoa recebe a mensagem, termina o
que está fazendo, e só então abre o link. A alternativa C otimiza segurança contra o comportamento
real do usuário.

Multiuso dentro da janela pelo mesmo motivo: fechar a aba sem querer não pode consumir o link.

A emissão passa a exigir `x-portal-secret` — padrão que **já existe no mesmo banco**, usado por outra
rotina agendada. Não é invenção: é aplicação de um padrão da casa que não tinha sido usado aqui.

## Consequências

**Positivas**
- Nenhum link válido parado: o token nasce no incidente e morre com ele
- Emitir revoga o anterior — um link por instância, sempre
- A emissão valida a instância antes: sem credencial utilizável, não emite e explica o motivo
- Fim do DoS de invalidação em massa

**Negativas** (aceitas)
- O fluxo n8n precisa mudar: passa a chamar a emissão em vez de ler a tabela
- Um segredo a mais para gerenciar
- Se a emissão estiver fora do ar, não há link de reserva — aceitável, já que sem o portal no ar o
  link também não serviria

**Passa a valer**
- A função de rotação em lote é **removida**, não desativada
- O agendamento de 2 em 2 horas é removido do banco
- `portal_link_tokens` ganha `unique (instance_id)`: um token vivo por instância
- Nova função `portal-issue-link`, protegida por segredo

## Quando revisitar

Se o volume crescer a ponto de a emissão sob demanda virar gargalo no incidente — o que exigiria
centenas de quedas simultâneas.
