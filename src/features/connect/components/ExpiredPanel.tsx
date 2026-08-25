/**
 * Tela de link expirado.
 *
 * Tres decisoes, todas registradas em 04-ui.md (TELA-06):
 *   - icone de RELOGIO, nao de erro: link expirado e comportamento normal e
 *     esperado; tratar como falha assusta sem motivo;
 *   - explica que a validade curta e proposital, o que transforma a limitacao em
 *     sinal de cuidado em vez de defeito;
 *   - a MESMA tela atende token expirado, invalido, ausente e instancia
 *     inexistente. Diferenciar permitiria enumerar instancias (SEC-03).
 *
 * Estado final sem acao: a Sandra genuinamente nao tem o que fazer aqui alem de
 * pedir outro link.
 *
 * Atende: FR-08
 */

import { Card, CardContent } from "@/components/ui/card";
import { StatusIcon } from "./StatusIcon";

export function ExpiredPanel() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-4 pt-6 text-center">
        <StatusIcon variante="expirado" />
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Este link expirou</h1>
          <p className="text-sm text-muted-foreground">
            Links de reconexao valem por poucas horas, por seguranca.
          </p>
          <p className="text-sm text-muted-foreground">
            Peca um link novo para quem cuida do seu WhatsApp e tente de novo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
