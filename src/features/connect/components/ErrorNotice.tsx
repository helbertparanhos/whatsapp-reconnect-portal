/**
 * Tela e aviso de erro.
 *
 * Toda falha exibe causa e proximo passo, nunca "erro" generico, e **sempre tem
 * uma acao** — inclusive o codigo desconhecido. Tela de erro sem saida foi o que
 * fez a versao anterior parecer quebrada mesmo quando o problema era temporario.
 *
 * Nenhuma mensagem daqui expoe URL, credencial ou stack trace (SEC-10).
 *
 * Atende: FR-07
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { mensagemDeErro } from "@/lib/errors";
import { StatusIcon } from "./StatusIcon";

/** Tela cheia: a falha impediu o fluxo de continuar. */
export function ErrorScreen({ codigo, onTentarDeNovo }: { codigo: string; onTentarDeNovo?: () => void }) {
  const { titulo, descricao, podeTentarDeNovo } = mensagemDeErro(codigo);

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-4 pt-6 text-center">
        <StatusIcon variante="erro" />
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
        {podeTentarDeNovo && onTentarDeNovo && (
          <Button className="h-12 w-full" onClick={onTentarDeNovo}>
            Tentar de novo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Aviso em linha: o fluxo continua, mas algo falhou. */
export function ErrorNotice({ codigo }: { codigo: string }) {
  const { titulo, descricao } = mensagemDeErro(codigo);
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="text-left">
        <span className="font-medium">{titulo}.</span> {descricao}
      </AlertDescription>
    </Alert>
  );
}
