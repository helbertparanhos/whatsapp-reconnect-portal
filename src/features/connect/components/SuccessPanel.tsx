/**
 * Tela de sucesso — o momento "aha".
 *
 * Estado final, sem botoes: nao ha proximo passo, e oferecer um seria inventar
 * trabalho para alguem que ja terminou.
 *
 * O texto muda conforme o caminho: quem acabou de conectar ouve "conectado!";
 * quem ja estava conectado ouve "ja esta conectado". Dizer "conectado!" para
 * quem nao fez nada confunde (FR-09).
 *
 * `aria-live="assertive"` porque e a informacao mais importante do fluxo e
 * precisa ser anunciada na hora, interrompendo o que estiver sendo lido.
 *
 * Atende: FR-06, FR-09, FR-10
 */

import { Card, CardContent } from "@/components/ui/card";
import { StatusIcon } from "./StatusIcon";

interface Props {
  label: string;
  /** Verdadeiro quando ja estava conectado ao abrir o link. */
  jaEstavaConectado: boolean;
}

export function SuccessPanel({ label, jaEstavaConectado }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-4 pt-6 text-center" role="status" aria-live="assertive">
        <StatusIcon variante="sucesso" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {jaEstavaConectado ? "Ja esta conectado" : "WhatsApp conectado!"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {jaEstavaConectado
              ? `${label} esta funcionando normalmente. Voce pode fechar esta pagina.`
              : `${label} esta de volta ao ar. Voce ja pode fechar esta pagina.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
