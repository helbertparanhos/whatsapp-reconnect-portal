/**
 * Adapter UAZAPI.
 *
 * Particularidades verificadas por sondagem direta contra a API:
 *   - a instancia e identificada pelo header `token`, NAO por path
 *   - conectar e `POST /instance/connect` (os outros dois usam GET)
 *   - pareamento com o telefone no **body**
 *   - `base_url` obrigatorio: cada operador tem o seu host
 *
 * >>> CORRECAO DO R-01 <<<
 *
 * O sistema anterior chamava `GET /instance/status/{id}`. Essa rota NAO EXISTE.
 * Sondagem em 2026-08-24:
 *
 *     GET /instance/status              -> 401 {"message":"Missing token."}   rota existe
 *     GET /instance/status/abc123       -> 404 {"message":"Not Found."}       rota nao existe
 *     GET /instance/rota-inventada      -> 404 {"message":"Not Found."}       controle
 *
 * O 404 da rota usada e identico ao de uma rota inventada — prova de que era a
 * rota que estava errada, nao a instancia que nao existia. Como o front engolia
 * o erro num `catch {}`, o polling desta instancia nunca funcionou: a pagina
 * apenas girava para sempre.
 *
 * O identificador NAO entra no path. O teste de contrato asserta isso.
 *
 * Implementa: 03-spec.md §Mapa de traducao
 * Atende: FR-12 · Corrige: R-01
 */

import type { ConnectOptions, ConnectResult, InstanceContext, ProviderAdapter, StatusResult } from "./types.ts";
import { callProvider, joinUrl, requireBaseUrl, requireCredential } from "./http.ts";
import { extractPaircode, extractQrcode, normalizeStatus } from "./normalize.ts";
import { AppError } from "../errors.ts";

const headersFor = (ctx: InstanceContext): Record<string, string> => ({
  token: requireCredential(ctx.credentials, "token", "uazapi"),
});

export const uazapi: ProviderAdapter = {
  id: "uazapi",
  supportsPairing: true,

  async connect(ctx: InstanceContext, opts: ConnectOptions): Promise<ConnectResult> {
    const base = requireBaseUrl(ctx.baseUrl, "uazapi");
    const raw = await callProvider({
      url: joinUrl(base, "/instance/connect"),
      method: "POST",
      headers: headersFor(ctx),
      body: opts.phone ? { phone: opts.phone } : {},
    });

    const status = normalizeStatus(raw);

    if (opts.phone) {
      const paircode = extractPaircode(raw);
      if (!paircode) throw new AppError("provider_error", "uazapi: resposta sem codigo de pareamento");
      return { qrcode: null, paircode, status };
    }

    if (status === "connected") return { qrcode: null, paircode: null, status };

    const qrcode = extractQrcode(raw);
    if (!qrcode) throw new AppError("provider_error", "uazapi: resposta sem QR code");
    return { qrcode, paircode: null, status };
  },

  async status(ctx: InstanceContext): Promise<StatusResult> {
    const base = requireBaseUrl(ctx.baseUrl, "uazapi");
    // Sem identificador no path. Ver o bloco do R-01 no topo do arquivo.
    const raw = await callProvider({
      url: joinUrl(base, "/instance/status"),
      method: "GET",
      headers: headersFor(ctx),
    });
    return { status: normalizeStatus(raw) };
  },
};
