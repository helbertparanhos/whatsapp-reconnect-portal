/**
 * Adapter Evolution API (auto-hospedado).
 *
 * Particularidades verificadas no codigo-fonte do projeto:
 *   - instancia vai **no path**: /instance/connect/{nome}
 *   - autenticacao por header `apikey`
 *   - `base_url` e obrigatorio: cada operador hospeda o seu
 *   - pareamento por **query string**: ?number={phone}
 *   - status em rota propria: /instance/connectionState/{nome}
 *   - o QR vem no campo `base64`
 *   - vocabulario de status: open / connecting / close
 *
 * Implementa: 03-spec.md §Mapa de traducao
 * Atende: FR-12
 */

import type { ConnectOptions, ConnectResult, InstanceContext, ProviderAdapter, StatusResult } from "./types.ts";
import { callProvider, joinUrl, requireBaseUrl, requireCredential } from "./http.ts";
import { extractPaircode, extractQrcode, normalizeStatus } from "./normalize.ts";
import { AppError } from "../errors.ts";

const headersFor = (ctx: InstanceContext): Record<string, string> => ({
  apikey: requireCredential(ctx.credentials, "api_key", "evolution"),
});

export const evolution: ProviderAdapter = {
  id: "evolution",
  supportsPairing: true,

  async connect(ctx: InstanceContext, opts: ConnectOptions): Promise<ConnectResult> {
    const base = requireBaseUrl(ctx.baseUrl, "evolution");
    const path = `/instance/connect/${encodeURIComponent(ctx.externalId)}`;
    const url = opts.phone
      ? `${joinUrl(base, path)}?number=${encodeURIComponent(opts.phone)}`
      : joinUrl(base, path);

    const raw = await callProvider({ url, method: "GET", headers: headersFor(ctx) });
    const status = normalizeStatus(raw);

    if (opts.phone) {
      const paircode = extractPaircode(raw);
      if (!paircode) throw new AppError("provider_error", "evolution: resposta sem codigo de pareamento");
      return { qrcode: null, paircode, status };
    }

    if (status === "connected") return { qrcode: null, paircode: null, status };

    const qrcode = extractQrcode(raw);
    if (!qrcode) throw new AppError("provider_error", "evolution: resposta sem QR code");
    return { qrcode, paircode: null, status };
  },

  async status(ctx: InstanceContext): Promise<StatusResult> {
    const base = requireBaseUrl(ctx.baseUrl, "evolution");
    const raw = await callProvider({
      url: joinUrl(base, `/instance/connectionState/${encodeURIComponent(ctx.externalId)}`),
      method: "GET",
      headers: headersFor(ctx),
    });
    return { status: normalizeStatus(raw) };
  },
};
