/**
 * Painel de QR Code — a tela principal do produto.
 *
 * Decisoes registradas em 04-ui.md (TELA-02 e TELA-04):
 *   - o QR aparece SEM nenhuma pergunta antes; a versao anterior perguntava
 *     "QR Code ou codigo de pareamento?", e a Sandra nao sabe a diferenca;
 *   - fundo branco fixo mesmo no tema escuro: QR invertido nao e lido por muitos
 *     aparelhos, e legibilidade por camera vence consistencia visual;
 *   - o pareamento fica na mesma tela, como alternativa secundaria;
 *   - ao pausar, o tom e "pausamos", nunca "tempo esgotado": nao e falha da
 *     Sandra e o texto nao pode soar como repreensao.
 *
 * Atende: FR-02, FR-03, FR-04, FR-10
 */

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Smartphone } from "lucide-react";
import { Countdown } from "./Countdown";
import { InstructionList, PASSOS_QRCODE } from "./InstructionList";
import type { EstadoQr } from "../hooks/useQrRefresh";

interface Props {
  estado: EstadoQr;
  suportaPareamento: boolean;
  onUsarPareamento: () => void;
}

/** Area do QR com tamanho fixo, para o layout nao saltar entre carregar e
 *  mostrar. Fundo branco em qualquer tema. */
function MolduraQr({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-border">
      {children}
    </div>
  );
}

export function QrPanel({ estado, suportaPareamento, onUsarPareamento }: Props) {
  const { qrcode, segundosRestantes, carregando, pausado, falhaAoRenovar, gerarNovo } = estado;

  return (
    <div className="space-y-4">
      {pausado ? (
        <>
          <MolduraQr>
            {qrcode ? (
              // QR anterior esmaecido: decorativo agora, quem informa e o texto.
              <img src={qrcode} alt="" aria-hidden="true" className="h-full w-full opacity-40" />
            ) : (
              <Smartphone className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            )}
          </MolduraQr>

          <div className="space-y-1.5 text-center">
            <p className="font-medium text-foreground">Pausamos por aqui</p>
            <p className="text-sm text-muted-foreground">
              Ninguem leu o codigo nas ultimas tentativas. Toque abaixo quando estiver com o celular
              em maos.
            </p>
          </div>

          <Button className="h-12 w-full" onClick={gerarNovo} disabled={carregando}>
            {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {carregando ? "Gerando…" : "Gerar novo codigo"}
          </Button>
        </>
      ) : (
        <>
          <MolduraQr>
            {qrcode ? (
              <img
                src={qrcode}
                alt="QR Code para conectar o WhatsApp"
                className="h-full w-full"
                width={256}
                height={256}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                <span className="text-sm">Gerando o codigo…</span>
              </div>
            )}
          </MolduraQr>

          {qrcode && <Countdown segundos={segundosRestantes} renovando={carregando} />}

          {falhaAoRenovar && (
            <Alert role="status">
              <AlertDescription className="text-sm">
                Nao conseguimos atualizar o codigo. Ele pode ter expirado —{" "}
                <button onClick={gerarNovo} className="font-medium underline underline-offset-2">
                  toque para gerar outro
                </button>
                .
              </AlertDescription>
            </Alert>
          )}

          {qrcode && <InstructionList titulo="Como escanear:" passos={PASSOS_QRCODE} />}
        </>
      )}

      {suportaPareamento && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-center text-sm text-muted-foreground">Nao consegue escanear?</p>
          <Button variant="outline" className="h-12 w-full gap-2" onClick={onUsarPareamento}>
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Usar codigo de 8 digitos
          </Button>
        </div>
      )}
    </div>
  );
}
