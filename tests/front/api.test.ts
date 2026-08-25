/**
 * Valida: FR-07 (erro visivel com causa)
 * Corrige e protege: P-10 — `res.json()` sem checar `res.ok` antes
 *
 * O codigo anterior fazia `res.json()` direto. Uma resposta de erro com corpo
 * nao-JSON — pagina de manutencao, erro de proxy, HTML do gateway — virava
 * excecao generica, e o usuario via "erro ao conectar" sem causa nenhuma.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { abrirSessao, consultarStatus, gerarQrCode, ApiError } from "../../src/features/connect/api";

const cred = { instance: "INST", token: "tok" };

function responder(body: string, status = 200, contentType = "application/json") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, headers: { "Content-Type": contentType } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("tratamento de resposta", () => {
  it("devolve os dados no caminho feliz", async () => {
    responder(JSON.stringify({ label: "Cliente", status: "disconnected", supports_pairing: true }));
    const r = await abrirSessao(cred);
    expect(r.label).toBe("Cliente");
  });

  it(">>> P-10: HTML num erro 502 vira ApiError, nao excecao generica", async () => {
    responder("<html><body>502 Bad Gateway</body></html>", 502, "text/html");
    await expect(abrirSessao(cred)).rejects.toBeInstanceOf(ApiError);
  });

  it(">>> P-10: HTML num 200 tambem e tratado", async () => {
    // Acontece quando um proxy devolve pagina de manutencao com status 200.
    responder("<html>manutencao</html>", 200, "text/html");
    await expect(abrirSessao(cred)).rejects.toBeInstanceOf(ApiError);
  });

  it("corpo vazio num erro nao estoura", async () => {
    responder("", 500);
    await expect(consultarStatus(cred)).rejects.toBeInstanceOf(ApiError);
  });

  it("preserva o codigo de erro devolvido pela API", async () => {
    responder(JSON.stringify({ error: "rate_limited", retry_after_seconds: 600 }), 429);
    try {
      await consultarStatus(cred);
      expect.unreachable("deveria ter falhado");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("rate_limited");
      expect((e as ApiError).retryAfterSeconds).toBe(600);
    }
  });

  it("erro sem codigo conhecido cai em provider_error", async () => {
    responder(JSON.stringify({ mensagem: "algo" }), 500);
    try {
      await consultarStatus(cred);
      expect.unreachable("deveria ter falhado");
    } catch (e) {
      expect((e as ApiError).code).toBe("provider_error");
    }
  });

  it("falha de rede vira codigo 'network'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    try {
      await consultarStatus(cred);
      expect.unreachable("deveria ter falhado");
    } catch (e) {
      expect((e as ApiError).code).toBe("network");
    }
  });

  it("aborto NAO vira erro de aplicacao — e cancelamento nosso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }));
    await expect(consultarStatus(cred)).rejects.toBeInstanceOf(DOMException);
  });
});

describe("montagem da requisicao", () => {
  it("envia o metodo correto para cada operacao", async () => {
    responder(JSON.stringify({ qrcode: "data:image/png;base64,x", status: "disconnected" }));
    await gerarQrCode(cred);
    const chamada = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const corpo = JSON.parse(chamada[1].body);
    expect(corpo.method).toBe("qrcode");
    expect(corpo.instance).toBe("INST");
    expect(corpo.token).toBe("tok");
  });

  it("sempre usa POST com Content-Type json", async () => {
    responder(JSON.stringify({ status: "disconnected" }));
    await consultarStatus(cred);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("nao envia o token em cabecalho nem na URL — so no corpo", async () => {
    // O token na URL vazaria em log de servidor e no header Referer.
    responder(JSON.stringify({ status: "disconnected" }));
    await consultarStatus(cred);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).not.toContain("tok");
    expect(JSON.stringify(init.headers)).not.toContain("tok");
  });
});
