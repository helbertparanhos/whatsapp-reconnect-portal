// @vitest-environment node
/**
 * Valida: FR-15 (token irreversivel), SEC-01 (varredura), FR-14 (segredo da emissao)
 */
import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  hashIp,
  timingSafeEqual,
  resolveTtlMinutes,
  MAX_TTL_MINUTES,
} from "../../supabase/functions/_shared/token.ts";

describe("generateToken", () => {
  it("gera 32 caracteres por padrao", () => {
    expect(generateToken()).toHaveLength(32);
  });

  it("nao repete entre chamadas", () => {
    const amostra = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(amostra.size).toBe(500);
  });

  it("nao usa caracteres ambiguos (I l 1 O 0)", () => {
    // O token pode ser lido em voz alta ao telefone com o suporte.
    const juntos = Array.from({ length: 200 }, () => generateToken()).join("");
    expect(juntos).not.toMatch(/[Il1O0]/);
  });

  it("distribui os simbolos sem vies perceptivel", () => {
    // Rejeicao de amostra em vez de modulo simples: o modulo enviesaria os
    // primeiros simbolos do alfabeto e reduziria a entropia real (SEC-01).
    const juntos = Array.from({ length: 4000 }, () => generateToken()).join("");
    const cont = new Map<string, number>();
    for (const c of juntos) cont.set(c, (cont.get(c) ?? 0) + 1);

    const esperado = juntos.length / 56;
    const desvios = [...cont.values()].map((n) => Math.abs(n - esperado) / esperado);
    expect(Math.max(...desvios)).toBeLessThan(0.15);
  });

  it("tem entropia acima dos 128 bits exigidos", () => {
    expect(32 * Math.log2(56)).toBeGreaterThan(128);
  });
});

describe("hashToken", () => {
  it("confere com o SHA-256 conhecido de 'abc'", async () => {
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("e deterministico", async () => {
    const t = generateToken();
    expect(await hashToken(t)).toBe(await hashToken(t));
  });

  it("nao permite reconstruir o token", async () => {
    const t = generateToken();
    const h = await hashToken(t);
    expect(h).not.toContain(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tokens diferentes geram hashes diferentes", async () => {
    expect(await hashToken("a")).not.toBe(await hashToken("b"));
  });
});

describe("hashIp", () => {
  it("devolve null sem sal — nao existe hash de IP sem sal (RNF-09)", async () => {
    expect(await hashIp("203.0.113.10", "")).toBeNull();
  });

  it("devolve null sem IP", async () => {
    expect(await hashIp(null, "sal")).toBeNull();
  });

  it("o mesmo IP com sais diferentes gera hashes diferentes", async () => {
    const a = await hashIp("203.0.113.10", "sal-a");
    const b = await hashIp("203.0.113.10", "sal-b");
    expect(a).not.toBe(b);
  });

  it("nao contem o IP em claro", async () => {
    const h = await hashIp("203.0.113.10", "sal");
    expect(h).not.toContain("203.0.113.10");
  });
});

describe("timingSafeEqual", () => {
  it("aceita iguais e recusa diferentes", () => {
    expect(timingSafeEqual("segredo", "segredo")).toBe(true);
    expect(timingSafeEqual("segredo", "segred0")).toBe(false);
  });

  it("recusa tamanhos diferentes sem estourar", () => {
    expect(timingSafeEqual("abc", "abcdef")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("aceita vazio com vazio", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("resolveTtlMinutes", () => {
  it("usa o padrao de 120 min quando nao informado", () => {
    expect(resolveTtlMinutes(undefined)).toBe(MAX_TTL_MINUTES);
  });

  it("limita ao teto de 120 min (RNF-05)", () => {
    expect(resolveTtlMinutes(9999)).toBe(MAX_TTL_MINUTES);
  });

  it("recusa valores invalidos caindo no padrao", () => {
    expect(resolveTtlMinutes("120")).toBe(MAX_TTL_MINUTES);
    expect(resolveTtlMinutes(NaN)).toBe(MAX_TTL_MINUTES);
  });

  it("nunca devolve menos de 1 min", () => {
    expect(resolveTtlMinutes(0)).toBe(1);
    expect(resolveTtlMinutes(-50)).toBe(1);
  });

  it("respeita valor valido abaixo do teto", () => {
    expect(resolveTtlMinutes(30)).toBe(30);
  });
});
