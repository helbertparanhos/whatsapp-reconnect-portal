/**
 * Renovacao automatica do QR, com contador e teto de ciclos.
 *
 * O WhatsApp invalida o QR a cada 20 segundos. O codigo anterior nao renovava
 * nem avisava: a pessoa encarava um QR morto e concluia que o sistema nao
 * funciona (R-07).
 *
 * O teto de 3 ciclos vem da recomendacao do proprio fornecedor: "caso o usuario
 * nao leia o QRCode apos 3 chamadas, interrompa o fluxo e adicione um botao
 * solicitando interacao". Serve a dois propositos — nao gastar cota com aba
 * esquecida (R-06) e nao insistir com quem nao esta na frente da tela.
 *
 * Atende: FR-02, FR-03, FR-04 · Mitiga: R-06, R-07
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, gerarQrCode } from "../api";

/** Recomendacao do fornecedor. */
export const MAX_CICLOS = 3;

interface Opcoes {
  instance: string;
  token: string;
  ttlMs: number;
  ativo: boolean;
  onConectado: () => void;
  onErro: (codigo: string) => void;
}

export interface EstadoQr {
  qrcode: string | null;
  /** Segundos restantes do QR atual. Elemento obrigatorio da tela (FR-03). */
  segundosRestantes: number;
  carregando: boolean;
  /** Teto de ciclos atingido: a renovacao parou e espera acao da pessoa. */
  pausado: boolean;
  /** Renovacao falhou, mas o QR anterior continua na tela (FR-03). */
  falhaAoRenovar: boolean;
  gerarNovo: () => void;
}

export function useQrRefresh(opcoes: Opcoes): EstadoQr {
  const { instance, token, ttlMs, ativo, onConectado, onErro } = opcoes;

  const [qrcode, setQrcode] = useState<string | null>(null);
  const [segundosRestantes, setSegundos] = useState(Math.floor(ttlMs / 1000));
  const [carregando, setCarregando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [falhaAoRenovar, setFalha] = useState(false);

  const ciclosRef = useRef(0);
  const gerandoRef = useRef(false); // trava contra duplo clique (FR-04)
  const onConectadoRef = useRef(onConectado);
  const onErroRef = useRef(onErro);
  useEffect(() => {
    onConectadoRef.current = onConectado;
    onErroRef.current = onErro;
  });

  const buscar = useCallback(
    async (signal?: AbortSignal) => {
      if (gerandoRef.current) return;
      gerandoRef.current = true;
      setCarregando(true);

      try {
        const r = await gerarQrCode({ instance, token }, signal);

        if (r.status === "connected") {
          onConectadoRef.current();
          return;
        }
        if (r.qrcode) {
          setQrcode(r.qrcode);
          setSegundos(Math.floor((r.qr_ttl_ms || ttlMs) / 1000));
          setFalha(false);
          ciclosRef.current += 1;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;

        const codigo = e instanceof ApiError ? e.code : "network";
        const terminal = ["invalid_token", "unauthorized", "not_found", "inactive", "rate_limited", "config_error"];

        if (terminal.includes(codigo)) {
          onErroRef.current(codigo);
          return;
        }
        // Falha transitoria com QR na tela: mantem o QR e sinaliza. Trocar por
        // uma tela de erro tiraria da pessoa um codigo que ainda pode funcionar.
        setQrcode((atual) => {
          if (atual) {
            setFalha(true);
            return atual;
          }
          onErroRef.current(codigo);
          return null;
        });
      } finally {
        gerandoRef.current = false;
        setCarregando(false);
      }
    },
    [instance, token, ttlMs],
  );

  const gerarNovo = useCallback(() => {
    ciclosRef.current = 0;
    setPausado(false);
    setFalha(false);
    void buscar();
  }, [buscar]);

  // Primeira busca ao ativar: o QR aparece sem nenhuma pergunta antes (FR-02).
  useEffect(() => {
    if (!ativo) return;
    const controller = new AbortController();
    void buscar(controller.signal);
    return () => controller.abort();
  }, [ativo, buscar]);

  // Contador regressivo. O updater e PURO: so decrementa.
  //
  // A versao anterior decidia dentro do updater — chamava `setPausado` e
  // `buscar()` de dentro de `setSegundos`. Efeito colateral dentro de funcao de
  // atualizacao nao e suportado: o React pode executar o updater duas vezes ou
  // descartar o resultado, e a pausa simplesmente nao acontecia. Na pratica o QR
  // renovava para sempre, que e exatamente o que o teto existe para impedir.
  useEffect(() => {
    if (!ativo || pausado || !qrcode) return;

    const tick = setInterval(() => {
      setSegundos((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(tick);
  }, [ativo, pausado, qrcode]);

  // A decisao vive num efeito proprio, reagindo ao contador chegar a zero.
  useEffect(() => {
    if (!ativo || pausado || !qrcode || segundosRestantes > 0) return;

    if (ciclosRef.current >= MAX_CICLOS) {
      setPausado(true);
      return;
    }
    void buscar();
  }, [ativo, pausado, qrcode, segundosRestantes, buscar]);

  return { qrcode, segundosRestantes, carregando, pausado, falhaAoRenovar, gerarNovo };
}
