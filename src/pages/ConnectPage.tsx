/**
 * Pagina de reconexao — orquestra os sete estados.
 *
 * Uma rota, sete estados, zero navegacao entre paginas: navegar seria friccao
 * pura num fluxo que precisa durar menos de dois minutos.
 *
 * Fluxo (04-ui.md §Fluxo de navegacao):
 *   carregando -> expirado | conectado | qr | erro
 *   qr <-> pareamento · qr -> pausado -> qr
 *   qualquer um -> conectado, assim que o polling detectar
 *
 * Atende: FR-01 a FR-10, FR-19
 */

import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

import { useSession } from "@/features/connect/hooks/useSession";
import { useQrRefresh } from "@/features/connect/hooks/useQrRefresh";
import { useConnectionPoll } from "@/features/connect/hooks/useConnectionPoll";
import { gerarCodigoPareamento, ApiError } from "@/features/connect/api";

import { QrPanel } from "@/features/connect/components/QrPanel";
import { PairPanel } from "@/features/connect/components/PairPanel";
import { SuccessPanel } from "@/features/connect/components/SuccessPanel";
import { ExpiredPanel } from "@/features/connect/components/ExpiredPanel";
import { ErrorScreen } from "@/features/connect/components/ErrorNotice";
import { Button } from "@/components/ui/button";

type Metodo = "qrcode" | "paircode";

/** Centraliza o card. Mesma moldura em todos os estados, para a tela nao
 *  "pular" nas transicoes. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      {children}
    </main>
  );
}

export default function ConnectPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const [searchParams] = useSearchParams();
  // `t` e o parametro curto do link; `token` fica aceito por compatibilidade.
  const token = searchParams.get("t") ?? searchParams.get("token") ?? "";

  const sessao = useSession(instanceId, token);

  const [conectado, setConectado] = useState(false);
  const [jaEstavaConectado, setJaEstava] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("qrcode");
  const [erroTerminal, setErroTerminal] = useState<string | null>(null);

  const [paircode, setPaircode] = useState<string | null>(null);
  const [gerandoPar, setGerandoPar] = useState(false);
  const [erroPar, setErroPar] = useState<string | null>(null);

  const dados = sessao.fase === "valida" ? sessao.dados : null;
  const jaConectadoNaAbertura = dados?.status === "connected";

  const marcarConectado = useCallback(() => setConectado(true), []);
  const marcarErro = useCallback((codigo: string) => setErroTerminal(codigo), []);

  // QR so e solicitado quando ha sessao valida, a instancia nao esta conectada,
  // e o metodo escolhido e o QR (FR-02, FR-09).
  const qr = useQrRefresh({
    instance: instanceId ?? "",
    token,
    ttlMs: dados?.qr_ttl_ms ?? 20_000,
    ativo: Boolean(dados) && !jaConectadoNaAbertura && !conectado && !erroTerminal && metodo === "qrcode",
    onConectado: marcarConectado,
    onErro: marcarErro,
  });

  const poll = useConnectionPoll({
    instance: instanceId ?? "",
    token,
    intervaloMs: dados?.poll_interval_ms ?? 5_000,
    ativo: Boolean(dados) && !jaConectadoNaAbertura && !conectado && !erroTerminal,
    onConectado: marcarConectado,
    onErro: marcarErro,
  });

  const gerarPareamento = useCallback(
    async (telefone: string) => {
      if (!instanceId) return;
      setGerandoPar(true);
      setErroPar(null);
      try {
        const r = await gerarCodigoPareamento({ instance: instanceId, token }, telefone);
        if (r.status === "connected") {
          setConectado(true);
          return;
        }
        setPaircode(r.paircode);
      } catch (e) {
        setErroPar(e instanceof ApiError ? e.code : "network");
      } finally {
        setGerandoPar(false);
      }
    },
    [instanceId, token],
  );

  // ---- estados finais -----------------------------------------------------

  if (sessao.fase === "carregando") {
    return (
      <Moldura>
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Verificando seu link…</p>
        </div>
      </Moldura>
    );
  }

  if (sessao.fase === "expirada") {
    return (
      <Moldura>
        <ExpiredPanel />
      </Moldura>
    );
  }

  if (sessao.fase === "erro") {
    return (
      <Moldura>
        <ErrorScreen codigo={sessao.codigo} onTentarDeNovo={() => window.location.reload()} />
      </Moldura>
    );
  }

  if (conectado || jaConectadoNaAbertura) {
    return (
      <Moldura>
        <SuccessPanel
          label={sessao.dados.label}
          jaEstavaConectado={jaConectadoNaAbertura && !conectado ? true : jaEstavaConectado}
        />
      </Moldura>
    );
  }

  if (erroTerminal) {
    return (
      <Moldura>
        <ErrorScreen
          codigo={erroTerminal}
          onTentarDeNovo={() => {
            setErroTerminal(null);
            setJaEstava(false);
            qr.gerarNovo();
          }}
        />
      </Moldura>
    );
  }

  // ---- tela de conexao ----------------------------------------------------

  return (
    <Moldura>
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 pb-4 text-center">
          <h1 className="text-xl font-semibold text-foreground">Reconectar o WhatsApp</h1>
          <p className="text-sm text-muted-foreground">{sessao.dados.label}</p>
        </CardHeader>

        <CardContent>
          {metodo === "qrcode" ? (
            <QrPanel
              estado={qr}
              suportaPareamento={sessao.dados.supports_pairing}
              onUsarPareamento={() => setMetodo("paircode")}
            />
          ) : (
            <PairPanel
              paircode={paircode}
              carregando={gerandoPar}
              erro={erroPar}
              onGerar={gerarPareamento}
              onVoltar={() => {
                setMetodo("qrcode");
                setPaircode(null);
                setErroPar(null);
              }}
            />
          )}

          {poll.pausadoPorTempo && (
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Paramos de verificar a conexao para nao consumir dados a toa.
              </p>
              <Button variant="outline" className="h-12 w-full" onClick={poll.retomar}>
                Voltar a verificar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Moldura>
  );
}
