/**
 * Adapter Z-API.
 *
 * Particularidades verificadas na documentacao oficial:
 *   - instancia e token vao **no path**: /instances/{id}/token/{token}/...
 *   - host e fixo do fornecedor; `base_url` so serve para apontar um proxy
 *   - `Client-Token` e de CONTA, nao de instancia, e e opcional (so exigido se
 *     o recurso estiver ativado no painel)
 *   - pareamento pelo path: /phone-code/{phone}
 *   - o QR vem no campo `value`
 *   - o WhatsApp invalida o QR a cada 20 segundos
 *
 * Implementa: 03-spec.md §Mapa de traducao
 * Atende: FR-12
 */

import type { ConnectOptions, ConnectResult, InstanceContext, ProviderAdapter, StatusResult } from "./types.ts";
import { callProvider, requireCredential } from "./http.ts";
import { extractPaircode, extractQrcode, normalizeStatus } from "./normalize.ts";
import { AppError } from "../errors.ts";

const DEFAULT_HOST = "https://api.z-api.io";

function baseFor(ctx: InstanceContext): string {
  const host = (ctx.baseUrl?.trim() || DEFAULT_HOST).replace(/\/+$/, "");
  const token = requireCredential(ctx.credentials, "token", "zapi");
  return `${host}/instances/${encodeURIComponent(ctx.externalId)}/token/${encodeURIComponent(token)}`;
}

function headersFor(ctx: InstanceContext): Record<string, string> {
  const clientToken = ctx.credentials.client_token?.trim();
  // Enviado apenas quando existe: mandar cabecalho vazio faz a API responder
  // "null not allowed" mesmo com o recurso desativado.
  return clientToken ? { "Client-Token": clientToken } : {};
}

export const zapi: ProviderAdapter = {
  id: "zapi",
  supportsPairing: true,

  async connect(ctx: InstanceContext, opts: ConnectOptions): Promise<ConnectResult> {
    const base = baseFor(ctx);
    const headers = headersFor(ctx);

    if (opts.phone) {
      const raw = await callProvider({
        url: `${base}/phone-code/${encodeURIComponent(opts.phone)}`,
        method: "GET",
        headers,
      });
      const paircode = extractPaircode(raw);
      if (!paircode) throw new AppError("provider_error", "zapi: resposta sem codigo de pareamento");
      return { qrcode: null, paircode, status: normalizeStatus(raw) };
    }

    const raw = await callProvider({ url: `${base}/qr-code/image`, method: "GET", headers });
    const status = normalizeStatus(raw);

    // A Z-API recusa gerar QR quando ja esta conectada. Isso nao e erro — o
    // portal trata como sucesso e mostra a tela de conectado (FR-09).
    if (status === "connected") return { qrcode: null, paircode: null, status };

    const qrcode = extractQrcode(raw);
    if (!qrcode) throw new AppError("provider_error", "zapi: resposta sem QR code");
    return { qrcode, paircode: null, status };
  },

  async status(ctx: InstanceContext): Promise<StatusResult> {
    const raw = await callProvider({
      url: `${baseFor(ctx)}/status`,
      method: "GET",
      headers: headersFor(ctx),
    });
    return { status: normalizeStatus(raw) };
  },
};
