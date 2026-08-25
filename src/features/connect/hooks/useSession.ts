/**
 * Validacao do link na abertura da pagina.
 *
 * Atende: FR-01, FR-08, FR-09
 */

import { useEffect, useState } from "react";
import { abrirSessao, ApiError, type SessionResponse } from "../api";
import { ehLinkInvalido } from "@/lib/errors";

export type EstadoSessao =
  | { fase: "carregando" }
  | { fase: "valida"; dados: SessionResponse }
  | { fase: "expirada" }
  | { fase: "erro"; codigo: string };

export function useSession(instance: string | undefined, token: string): EstadoSessao {
  const [estado, setEstado] = useState<EstadoSessao>({ fase: "carregando" });

  useEffect(() => {
    // Sem identificador ou sem token nao ha o que validar. Mesma tela do link
    // expirado: nao revelamos qual das duas coisas faltou (SEC-03).
    if (!instance || !token) {
      setEstado({ fase: "expirada" });
      return;
    }

    const controller = new AbortController();

    abrirSessao({ instance, token }, controller.signal)
      .then((dados) => setEstado({ fase: "valida", dados }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const codigo = e instanceof ApiError ? e.code : "network";
        setEstado(ehLinkInvalido(codigo) ? { fase: "expirada" } : { fase: "erro", codigo });
      });

    return () => controller.abort();
  }, [instance, token]);

  return estado;
}
