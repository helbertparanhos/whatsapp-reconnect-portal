/**
 * Polling de status com teto e pausa.
 *
 * O codigo anterior consultava a cada 5s **sem limite nenhum**: uma aba
 * esquecida gerava 720 invocacoes por hora, e 29 abas esquecidas por um dia
 * esgotariam a cota mensal do plano gratuito (R-06). Pior, o erro era engolido
 * num `catch {}`, entao uma aba em loop de falha nao aparecia para ninguem.
 *
 * Tres travas aqui:
 *   1. teto de tempo total (5 min) — depois disso para e avisa;
 *   2. pausa quando a aba vai para segundo plano — ninguem esta olhando;
 *   3. para de vez ao conectar ou ao receber erro terminal.
 *
 * Atende: FR-06, FR-19 · Mitiga: R-06, SEC-07
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, consultarStatus, type ConnStatus } from "../api";

/** Teto de tempo total. Passa disso, a pessoa nao esta mais na frente da tela. */
export const TETO_POLLING_MS = 5 * 60 * 1000;

interface Opcoes {
  instance: string;
  token: string;
  intervaloMs: number;
  /** So consulta quando ativo — a tela de sucesso e a de erro nao consultam. */
  ativo: boolean;
  onConectado: () => void;
  onErro: (codigo: string) => void;
}

export interface EstadoPolling {
  /** Verdadeiro quando o teto foi atingido e a consulta parou. */
  pausadoPorTempo: boolean;
  retomar: () => void;
}

export function useConnectionPoll(opcoes: Opcoes): EstadoPolling {
  const { instance, token, intervaloMs, ativo, onConectado, onErro } = opcoes;
  const [pausadoPorTempo, setPausadoPorTempo] = useState(false);
  const inicioRef = useRef<number>(Date.now());

  // Guardados em ref para nao reiniciar o intervalo a cada render do pai.
  const onConectadoRef = useRef(onConectado);
  const onErroRef = useRef(onErro);
  useEffect(() => {
    onConectadoRef.current = onConectado;
    onErroRef.current = onErro;
  });

  const retomar = useCallback(() => {
    inicioRef.current = Date.now();
    setPausadoPorTempo(false);
  }, []);

  useEffect(() => {
    if (!ativo || pausadoPorTempo) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parado = false;

    const parar = () => {
      parado = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };

    const consultar = async () => {
      if (parado) return;

      // Trava 1: teto de tempo.
      if (Date.now() - inicioRef.current >= TETO_POLLING_MS) {
        setPausadoPorTempo(true);
        return;
      }

      // Trava 2: aba em segundo plano. Nao consulta, mas continua agendando —
      // ao voltar, retoma sem exigir acao da pessoa.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(consultar, intervaloMs);
        return;
      }

      try {
        const { status } = await consultarStatus({ instance, token }, controller.signal);
        if (parado) return;

        if (status === ("connected" satisfies ConnStatus)) {
          onConectadoRef.current();
          return; // trava 3: conectou, nao agenda de novo
        }
      } catch (e) {
        if (parado || (e instanceof DOMException && e.name === "AbortError")) return;

        // Erro terminal para de vez. Insistir contra um link invalido e
        // exatamente o padrao de varredura que o rate limit barra.
        if (e instanceof ApiError) {
          const terminal = ["invalid_token", "unauthorized", "not_found", "inactive", "rate_limited"];
          if (terminal.includes(e.code)) {
            onErroRef.current(e.code);
            return;
          }
        }
        // Erro transitorio (rede, provider): segue tentando ate o teto. Nao e
        // engolido — o estado da tela nao muda, mas o ciclo tem fim.
      }

      timer = setTimeout(consultar, intervaloMs);
    };

    timer = setTimeout(consultar, intervaloMs);
    return parar;
  }, [ativo, pausadoPorTempo, instance, token, intervaloMs]);

  return { pausadoPorTempo, retomar };
}
