// @vitest-environment node
/**
 * Valida: FR-17 (origens permitidas), SEC-11
 */
import { describe, it, expect } from "vitest";
import {
  parseOrigins,
  corsHeaders,
  isOriginAllowed,
  preflight,
} from "../../supabase/functions/_shared/cors.ts";

const ALLOW = "Access-Control-Allow-Origin";

describe("parseOrigins", () => {
  it("separa por virgula e apara espaco", () => {
    expect(parseOrigins(" https://a.com , https://b.com ")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("remove barra final, que e erro comum de configuracao", () => {
    expect(parseOrigins("https://a.com/")).toEqual(["https://a.com"]);
  });

  it("devolve lista vazia para configuracao ausente", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins("  ,  ")).toEqual([]);
  });
});

describe("corsHeaders", () => {
  const allowed = ["https://portal.exemplo.com"];

  it("libera origem listada", () => {
    expect(corsHeaders("https://portal.exemplo.com", allowed)[ALLOW]).toBe(
      "https://portal.exemplo.com",
    );
  });

  it("NAO libera origem fora da lista", () => {
    expect(corsHeaders("https://malicioso.com", allowed)[ALLOW]).toBeUndefined();
  });

  it("nunca devolve curinga", () => {
    // O sistema anterior respondia '*' com verify_jwt desligado (P-02).
    for (const origem of ["https://portal.exemplo.com", "https://qualquer.com", null]) {
      expect(corsHeaders(origem, allowed)[ALLOW]).not.toBe("*");
    }
  });

  it("falha fechado: lista vazia nao libera ninguem", () => {
    // Esquecer de configurar nao pode virar liberacao geral.
    expect(corsHeaders("https://portal.exemplo.com", [])[ALLOW]).toBeUndefined();
  });

  it("tolera barra final na origem recebida", () => {
    expect(corsHeaders("https://portal.exemplo.com/", allowed)[ALLOW]).toBe(
      "https://portal.exemplo.com",
    );
  });

  it("sempre inclui Vary: Origin para nao envenenar cache", () => {
    expect(corsHeaders("https://portal.exemplo.com", allowed).Vary).toBe("Origin");
  });

  it("nao libera por prefixo — subdominio parecido nao entra", () => {
    expect(corsHeaders("https://portal.exemplo.com.malicioso.io", allowed)[ALLOW]).toBeUndefined();
  });
});

describe("isOriginAllowed", () => {
  it("recusa origem nula", () => {
    expect(isOriginAllowed(null, ["https://a.com"])).toBe(false);
  });
});

describe("preflight", () => {
  it("responde 204 mesmo para origem nao permitida, sem liberar", () => {
    const r = preflight("https://malicioso.com", ["https://a.com"]);
    expect(r.status).toBe(204);
    expect(r.headers.get(ALLOW)).toBeNull();
  });

  it("declara os metodos aceitos", () => {
    const r = preflight("https://a.com", ["https://a.com"]);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
