// @vitest-environment node
/**
 * Valida: FR-05 (codigo de pareamento), RNF-10 (telefone nao persistido)
 */
import { describe, it, expect } from "vitest";
import { checkPhone, normalizePhone } from "../../supabase/functions/_shared/phone.ts";

describe("checkPhone", () => {
  it("aceita numero brasileiro completo com DDI", () => {
    expect(checkPhone("5511999999999")).toEqual({ ok: true, value: "5511999999999" });
  });

  it("aceita a formatacao que a pessoa realmente digita", () => {
    // "+55 (11) 99999-9999" e como o numero aparece na agenda do celular.
    for (const entrada of ["+55 (11) 99999-9999", "55 11 99999 9999", "+55.11.99999.9999"]) {
      expect(checkPhone(entrada)).toEqual({ ok: true, value: "5511999999999" });
    }
  });

  it("recusa numero sem DDI por ser curto demais", () => {
    // Erro mais comum: digitar o numero como se ve na agenda, sem o 55.
    expect(checkPhone("999999999")).toEqual({ ok: false, reason: "too_short" });
  });

  it("aceita o minimo de 10 digitos", () => {
    expect(checkPhone("1199999999").ok).toBe(true);
  });

  it("recusa acima de 15 digitos (teto do E.164)", () => {
    expect(checkPhone("1234567890123456")).toEqual({ ok: false, reason: "too_long" });
  });

  it("aceita exatamente 15 digitos", () => {
    expect(checkPhone("123456789012345").ok).toBe(true);
  });

  it("recusa entrada com letra", () => {
    expect(checkPhone("55119999abcde")).toEqual({ ok: false, reason: "not_numeric" });
  });

  it("recusa vazio, espacos e tipos errados", () => {
    expect(checkPhone("")).toEqual({ ok: false, reason: "empty" });
    expect(checkPhone("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkPhone(undefined)).toEqual({ ok: false, reason: "empty" });
    expect(checkPhone(5511999999999)).toEqual({ ok: false, reason: "empty" });
  });

  it("recusa entrada so com pontuacao", () => {
    expect(checkPhone("()+- .")).toEqual({ ok: false, reason: "empty" });
  });

  it("nao aceita tentativa de injecao", () => {
    expect(checkPhone("5511999999999; DROP TABLE").ok).toBe(false);
    expect(checkPhone("<script>alert(1)</script>").ok).toBe(false);
  });

  it("devolve somente digitos — nunca a formatacao original", () => {
    const r = checkPhone("+55 (11) 99999-9999");
    expect(r.ok && r.value).toBe("5511999999999");
    expect(r.ok && /^\d+$/.test(r.value)).toBe(true);
  });
});

describe("normalizePhone", () => {
  it("devolve null para invalido, sem expor o motivo", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });

  it("devolve digitos para valido", () => {
    expect(normalizePhone("+55 11 99999-9999")).toBe("5511999999999");
  });
});
