/**
 * Respostas gravadas dos providers, com a forma verificada na fase 1.
 *
 * Regra do projeto: teste de contrato usa resposta REAL, nunca inventada. Uma
 * resposta inventada teria "confirmado" o endpoint errado do R-01 — o adapter
 * passaria no teste e continuaria quebrado em producao.
 *
 * Origem de cada forma:
 *   - Z-API: documentacao oficial (qrcode.md, status.md) e o fluxo de automacao
 *     em producao, que le `$json.value` da resposta de /qr-code/image
 *   - Evolution: instance.controller.ts do projeto e o fluxo em producao, que le
 *     `$json.base64`
 *   - UAZAPI: sondagem direta contra a API publica
 */

const QR_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const fixtures = {
  zapi: {
    // GET /qr-code/image — o QR vem em `value`, ja como data URI
    qrcode: { value: `data:image/png;base64,${QR_BASE64}` },
    // GET /phone-code/{phone}
    paircode: { value: "D4F28KQ1" },
    // GET /status
    statusConectado: { connected: true, error: null, smartphoneConnected: true },
    statusDesconectado: { connected: false, error: "You are not connected.", smartphoneConnected: false },
    // Chamar /qr-code/image com a instancia ja conectada
    jaConectado: { connected: true, error: "You are already connected." },
  },

  evolution: {
    // GET /instance/connect/{nome} — o QR vem em `base64`, base64 puro
    qrcode: { pairingCode: null, code: "2@abc...", base64: QR_BASE64, count: 1 },
    // GET /instance/connect/{nome}?number=...
    paircode: { pairingCode: "D4F2-8KQ1", code: "2@abc...", base64: null, count: 1 },
    // GET /instance/connectionState/{nome}
    statusConectado: { instance: { instanceName: "x", state: "open" } },
    statusConectando: { instance: { instanceName: "x", state: "connecting" } },
    statusDesconectado: { instance: { instanceName: "x", state: "close" } },
  },

  uazapi: {
    // POST /instance/connect
    qrcode: { connected: false, instance: { status: "disconnected", qrcode: QR_BASE64 } },
    paircode: { connected: false, instance: { status: "disconnected", paircode: "D4F28KQ1" } },
    // GET /instance/status  (SEM identificador no path — ver R-01)
    statusConectado: { connected: true, instance: { status: "connected" } },
    statusDesconectado: { connected: false, instance: { status: "disconnected" } },
  },

  QR_BASE64,
};
