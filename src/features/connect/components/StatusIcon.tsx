/**
 * Icone circular dos estados finais.
 *
 * A cor nunca e a unica portadora da informacao — cada variante traz um icone
 * proprio e vem sempre acompanhada de texto. Cerca de 8% dos homens tem alguma
 * deficiencia de percepcao de cor.
 *
 * Atende: FR-06, FR-07, FR-08, FR-10
 */

import { Check, Clock, AlertTriangle } from "lucide-react";

type Variante = "sucesso" | "expirado" | "erro";

const ESTILOS: Record<Variante, { fundo: string; cor: string; Icone: typeof Check; rotulo: string }> = {
  // Sucesso: verde, o unico momento em que a cor primaria aparece cheia.
  sucesso: { fundo: "bg-primary/10", cor: "text-primary", Icone: Check, rotulo: "Conectado" },
  // Expirado usa tom NEUTRO de proposito: link vencido e comportamento normal e
  // esperado. Pintar de vermelho assusta sem motivo (04-ui.md, TELA-06).
  expirado: { fundo: "bg-muted", cor: "text-muted-foreground", Icone: Clock, rotulo: "Expirado" },
  erro: { fundo: "bg-destructive/10", cor: "text-destructive", Icone: AlertTriangle, rotulo: "Erro" },
};

export function StatusIcon({ variante }: { variante: Variante }) {
  const { fundo, cor, Icone, rotulo } = ESTILOS[variante];
  return (
    <div
      className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${fundo}`}
      role="img"
      aria-label={rotulo}
    >
      <Icone className={`h-8 w-8 ${cor}`} aria-hidden="true" />
    </div>
  );
}
