/**
 * Contador de validade do QR.
 *
 * Elemento obrigatorio, nao enfeite. O WhatsApp invalida o QR a cada 20
 * segundos; sem o contador a pessoa escaneia um codigo morto e conclui que o
 * sistema nao funciona (R-07).
 *
 * `aria-live` atualiza a cada 5 segundos, nao a cada 1: leitor de tela
 * anunciando "19, 18, 17" torna a pagina inutilizavel.
 *
 * Atende: FR-03, FR-10
 */

import { RefreshCw } from "lucide-react";

interface Props {
  segundos: number;
  renovando: boolean;
}

export function Countdown({ segundos, renovando }: Props) {
  const texto = renovando
    ? "Gerando novo codigo…"
    : `Novo codigo em ${segundos}s`;

  // So anuncia em multiplos de 5 (ou no fim) para nao tagarelar.
  const deveAnunciar = renovando || segundos % 5 === 0 || segundos <= 3;

  return (
    <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
      <RefreshCw
        className={`h-3.5 w-3.5 ${renovando ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span aria-hidden="true">{texto}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {deveAnunciar ? texto : ""}
      </span>
    </p>
  );
}
