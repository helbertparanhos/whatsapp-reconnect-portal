// @vitest-environment node
/**
 * Valida: FR-11 (resolucao do provider), FR-12 (interface unica)
 * Corrige e protege: R-01 (endpoint de status da uazapi)
 *
 * Teste de contrato: cada adapter monta a requisicao certa e traduz a resposta
 * gravada para o vocabulario unico. Nao ha rede — `fetch` e capturado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { getAdapter, supportedProviders } from "../../supabase/functions/_shared/adapters/registry.ts";
import type { InstanceContext } from "../../supabase/functions/_shared/adapters/types.ts";
import { fixtures } from "./fixtures.ts";

/** Captura as chamadas e devolve a resposta gravada. */
function capturarFetch(resposta: unknown, status = 200) {
  const chamadas: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const fake = vi.fn(async (url: string | URL, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
    return new Response(JSON.stringify(resposta), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fake);
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

const ctx = {
  zapi: { externalId: "INST123", baseUrl: null, credentials: { token: "tok", client_token: "ct" } },
  evolution: { externalId: "minha-instancia", baseUrl: "https://evo.exemplo.com", credentials: { api_key: "ak" } },
  uazapi: { externalId: "r89abc", baseUrl: "https://uaz.exemplo.com", credentials: { token: "tok" } },
} satisfies Record<string, InstanceContext>;

// ---------------------------------------------------------------------------
describe("registry", () => {
  it("conhece exatamente os tres providers do parque", () => {
    expect(supportedProviders().sort()).toEqual(["evolution", "uazapi", "zapi"]);
  });

  it("recusa provider desconhecido com erro de configuracao, nao silencio", () => {
    expect(() => getAdapter("telegram")).toThrowError(/provider desconhecido/);
  });

  it("recusa string vazia — era o discriminador do sistema antigo (R-04)", () => {
    expect(() => getAdapter("")).toThrowError(/provider desconhecido/);
  });

  it("todo adapter expoe a interface completa", () => {
    for (const id of supportedProviders()) {
      const a = getAdapter(id);
      expect(a.id).toBe(id);
      expect(typeof a.connect).toBe("function");
      expect(typeof a.status).toBe("function");
      expect(typeof a.supportsPairing).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
describe("Z-API", () => {
  const a = getAdapter("zapi");

  it("busca o QR com instancia e token no path", async () => {
    const c = capturarFetch(fixtures.zapi.qrcode);
    await a.connect(ctx.zapi, {});
    expect(c[0].url).toBe("https://api.z-api.io/instances/INST123/token/tok/qr-code/image");
    expect(c[0].method).toBe("GET");
  });

  it("envia Client-Token quando existe", async () => {
    const c = capturarFetch(fixtures.zapi.qrcode);
    await a.connect(ctx.zapi, {});
    expect(c[0].headers["Client-Token"]).toBe("ct");
  });

  it("OMITE Client-Token quando nao existe", async () => {
    // Cabecalho vazio faz a API responder "null not allowed" mesmo com o
    // recurso desativado no painel.
    const c = capturarFetch(fixtures.zapi.qrcode);
    await a.connect({ ...ctx.zapi, credentials: { token: "tok" } }, {});
    expect(c[0].headers["Client-Token"]).toBeUndefined();
  });

  it("le o QR do campo `value` e devolve data URI", async () => {
    capturarFetch(fixtures.zapi.qrcode);
    const r = await a.connect(ctx.zapi, {});
    expect(r.qrcode).toMatch(/^data:image\/png;base64,/);
  });

  it("pede pareamento com o telefone no path", async () => {
    const c = capturarFetch(fixtures.zapi.paircode);
    const r = await a.connect(ctx.zapi, { phone: "5511999999999" });
    expect(c[0].url).toContain("/phone-code/5511999999999");
    expect(r.paircode).toBe("D4F28KQ1");
    expect(r.qrcode).toBeNull();
  });

  it("traduz connected:true", async () => {
    capturarFetch(fixtures.zapi.statusConectado);
    expect((await a.status(ctx.zapi)).status).toBe("connected");
  });

  it("traduz connected:false", async () => {
    capturarFetch(fixtures.zapi.statusDesconectado);
    expect((await a.status(ctx.zapi)).status).toBe("disconnected");
  });

  it("ja conectado nao e erro — devolve status sem QR (FR-09)", async () => {
    capturarFetch(fixtures.zapi.jaConectado);
    const r = await a.connect(ctx.zapi, {});
    expect(r.status).toBe("connected");
    expect(r.qrcode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Evolution", () => {
  const a = getAdapter("evolution");

  it("busca o QR com a instancia no path e apikey no header", async () => {
    const c = capturarFetch(fixtures.evolution.qrcode);
    await a.connect(ctx.evolution, {});
    expect(c[0].url).toBe("https://evo.exemplo.com/instance/connect/minha-instancia");
    expect(c[0].headers.apikey).toBe("ak");
  });

  it("le o QR do campo `base64` e converte para data URI", async () => {
    capturarFetch(fixtures.evolution.qrcode);
    const r = await a.connect(ctx.evolution, {});
    expect(r.qrcode).toBe(`data:image/png;base64,${fixtures.QR_BASE64}`);
  });

  it("pede pareamento por query string", async () => {
    const c = capturarFetch(fixtures.evolution.paircode);
    const r = await a.connect(ctx.evolution, { phone: "5511999999999" });
    expect(c[0].url).toContain("?number=5511999999999");
    expect(r.paircode).toBe("D4F2-8KQ1");
  });

  it("consulta status em rota propria", async () => {
    const c = capturarFetch(fixtures.evolution.statusConectado);
    await a.status(ctx.evolution);
    expect(c[0].url).toBe("https://evo.exemplo.com/instance/connectionState/minha-instancia");
  });

  it("traduz os tres estados: open / connecting / close", async () => {
    capturarFetch(fixtures.evolution.statusConectado);
    expect((await a.status(ctx.evolution)).status).toBe("connected");
    capturarFetch(fixtures.evolution.statusConectando);
    expect((await a.status(ctx.evolution)).status).toBe("connecting");
    capturarFetch(fixtures.evolution.statusDesconectado);
    expect((await a.status(ctx.evolution)).status).toBe("disconnected");
  });

  it("exige base_url — cada operador hospeda o seu", async () => {
    capturarFetch(fixtures.evolution.qrcode);
    await expect(a.connect({ ...ctx.evolution, baseUrl: null }, {})).rejects.toThrowError(/base_url/);
  });

  it("nao gera barra dupla quando base_url termina em barra", async () => {
    const c = capturarFetch(fixtures.evolution.qrcode);
    await a.connect({ ...ctx.evolution, baseUrl: "https://evo.exemplo.com/" }, {});
    expect(c[0].url).not.toContain("//instance");
  });
});

// ---------------------------------------------------------------------------
describe("UAZAPI", () => {
  const a = getAdapter("uazapi");

  it(">>> R-01: a URL de status NAO contem o identificador da instancia", async () => {
    // Este e o teste que teria pego o bug original. O sistema anterior chamava
    // GET /instance/status/{id}, rota que devolve 404 identico ao de uma rota
    // inventada — o polling nunca funcionou, e o `catch {}` escondia isso.
    const c = capturarFetch(fixtures.uazapi.statusConectado);
    await a.status(ctx.uazapi);

    expect(c[0].url).toBe("https://uaz.exemplo.com/instance/status");
    expect(c[0].url).not.toContain(ctx.uazapi.externalId);
    expect(c[0].url).not.toMatch(/\/instance\/status\/.+/);
  });

  it("identifica a instancia pelo header `token`, nao pelo path", async () => {
    const c = capturarFetch(fixtures.uazapi.statusConectado);
    await a.status(ctx.uazapi);
    expect(c[0].headers.token).toBe("tok");
  });

  it("conecta por POST — os outros dois usam GET", async () => {
    const c = capturarFetch(fixtures.uazapi.qrcode);
    await a.connect(ctx.uazapi, {});
    expect(c[0].method).toBe("POST");
    expect(c[0].url).toBe("https://uaz.exemplo.com/instance/connect");
  });

  it("manda o telefone no body, nao no path nem na query", async () => {
    const c = capturarFetch(fixtures.uazapi.paircode);
    const r = await a.connect(ctx.uazapi, { phone: "5511999999999" });
    expect(JSON.parse(c[0].body!)).toEqual({ phone: "5511999999999" });
    expect(c[0].url).not.toContain("5511999999999");
    expect(r.paircode).toBe("D4F28KQ1");
  });

  it("le o QR de instance.qrcode", async () => {
    capturarFetch(fixtures.uazapi.qrcode);
    const r = await a.connect(ctx.uazapi, {});
    expect(r.qrcode).toBe(`data:image/png;base64,${fixtures.QR_BASE64}`);
  });

  it("traduz instance.status", async () => {
    capturarFetch(fixtures.uazapi.statusConectado);
    expect((await a.status(ctx.uazapi)).status).toBe("connected");
    capturarFetch(fixtures.uazapi.statusDesconectado);
    expect((await a.status(ctx.uazapi)).status).toBe("disconnected");
  });
});

// ---------------------------------------------------------------------------
describe("comportamento comum aos tres", () => {
  const casos = [
    ["zapi", ctx.zapi, fixtures.zapi.statusConectado],
    ["evolution", ctx.evolution, fixtures.evolution.statusConectado],
    ["uazapi", ctx.uazapi, fixtures.uazapi.statusConectado],
  ] as const;

  it.each(casos)("%s devolve o vocabulario unico de status", async (id, c, fx) => {
    capturarFetch(fx);
    expect((await getAdapter(id).status(c)).status).toBe("connected");
  });

  it.each(casos)("%s traduz erro HTTP para provider_error", async (id, c) => {
    capturarFetch({ message: "boom" }, 503);
    await expect(getAdapter(id).status(c)).rejects.toMatchObject({ code: "provider_error" });
  });

  it.each(casos)("%s trata resposta nao-JSON sem excecao generica (P-10)", async (id, c) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 200 })));
    await expect(getAdapter(id).status(c)).rejects.toMatchObject({ code: "provider_error" });
  });

  it.each(casos)("%s nao vaza credencial na mensagem de erro (SEC-10)", async (id, c) => {
    capturarFetch({ message: "erro" }, 500);
    try {
      await getAdapter(id).status(c);
      expect.unreachable("deveria ter falhado");
    } catch (e) {
      const texto = (e as Error).message;
      expect(texto).not.toContain("tok");
      expect(texto).not.toContain("ak");
      expect(texto).not.toContain("ct");
    }
  });
});
