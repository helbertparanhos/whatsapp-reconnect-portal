/**
 * Valida: FR-07 (erro visivel com causa), SEC-10 (sem vazamento tecnico)
 */
import { describe, it, expect } from "vitest";
import { mensagemDeErro, ehLinkInvalido, CODIGOS_DE_LINK_INVALIDO } from "../../src/lib/errors";

const CODIGOS_DA_API = [
  "invalid_token", "rate_limited", "invalid_phone", "invalid_input",
  "pairing_unsupported", "already_connected", "provider_error", "config_error",
  "unauthorized", "not_found", "inactive", "no_credentials", "internal", "network",
];

describe("mensagemDeErro", () => {
  it("nunca devolve mensagem vazia, para nenhum codigo da API", () => {
    for (const c of CODIGOS_DA_API) {
      const m = mensagemDeErro(c);
      expect(m.titulo.length).toBeGreaterThan(0);
      expect(m.descricao.length).toBeGreaterThan(0);
    }
  });

  it("codigo desconhecido cai na generica COM acao — nunca beco sem saida", () => {
    const m = mensagemDeErro("codigo_que_nao_existe");
    expect(m.titulo).toBe("Algo deu errado");
    expect(m.podeTentarDeNovo).toBe(true);
  });

  it("null e undefined tambem caem na generica", () => {
    expect(mensagemDeErro(null).titulo).toBe("Algo deu errado");
    expect(mensagemDeErro(undefined).titulo).toBe("Algo deu errado");
  });

  it("nenhuma mensagem expoe detalhe tecnico (SEC-10)", () => {
    const proibido = /https?:\/\/|token|api[_ ]?key|supabase|postgres|select |stack|undefined|null/i;
    for (const c of [...CODIGOS_DA_API, "desconhecido"]) {
      const m = mensagemDeErro(c);
      expect(`${m.titulo} ${m.descricao}`).not.toMatch(proibido);
    }
  });

  it("nenhuma mensagem usa jargao que a persona nao entende", () => {
    // A Sandra nao sabe o que e instancia, token ou API.
    const jargao = /\binstancia\b|\btoken\b|\bAPI\b|\bendpoint\b|\bprovider\b/i;
    for (const c of CODIGOS_DA_API) {
      const m = mensagemDeErro(c);
      expect(`${m.titulo} ${m.descricao}`).not.toMatch(jargao);
    }
  });

  it("rate_limited nao oferece tentar de novo — insistir nao adianta", () => {
    expect(mensagemDeErro("rate_limited").podeTentarDeNovo).toBe(false);
  });

  it("provider_error oferece tentar de novo — costuma ser temporario", () => {
    expect(mensagemDeErro("provider_error").podeTentarDeNovo).toBe(true);
  });
});

describe("ehLinkInvalido", () => {
  it("os quatro codigos de link invalido levam a mesma tela (SEC-03)", () => {
    expect(CODIGOS_DE_LINK_INVALIDO).toEqual(["invalid_token", "unauthorized", "not_found", "inactive"]);
    for (const c of CODIGOS_DE_LINK_INVALIDO) expect(ehLinkInvalido(c)).toBe(true);
  });

  it("erro de provider NAO e tratado como link invalido", () => {
    // Mandar a pessoa pedir link novo quando o problema e o provider seria
    // manda-la resolver o problema errado.
    expect(ehLinkInvalido("provider_error")).toBe(false);
    expect(ehLinkInvalido("network")).toBe(false);
    expect(ehLinkInvalido(null)).toBe(false);
  });
});
