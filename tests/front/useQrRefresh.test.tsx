/**
 * Valida: FR-02 (QR na primeira tela), FR-03 (renovacao com contador),
 *         FR-04 (teto de ciclos e botao)
 * Mitiga: R-06 (cota) e R-07 (QR morto sem aviso)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useQrRefresh, MAX_CICLOS } from "../../src/features/connect/hooks/useQrRefresh";
import * as api from "../../src/features/connect/api";

const TTL = 20_000;
const base = {
  instance: "INST",
  token: "tok",
  ttlMs: TTL,
  ativo: true,
  onConectado: () => {},
  onErro: () => {},
};

const respostaQr = (qr = "data:image/png;base64,AAA") => ({
  qrcode: qr,
  paircode: null,
  status: "disconnected" as const,
  qr_ttl_ms: TTL,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useQrRefresh", () => {
  it("pede o QR imediatamente ao ativar, sem perguntar nada antes (FR-02)", async () => {
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    const { result } = renderHook(() => useQrRefresh(base));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.qrcode).toMatch(/^data:image\/png;base64,/);
  });

  it("nao pede nada quando inativo", async () => {
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    renderHook(() => useQrRefresh({ ...base, ativo: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(spy).not.toHaveBeenCalled();
  });

  it("o contador regride a cada segundo (FR-03)", async () => {
    vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    const { result } = renderHook(() => useQrRefresh(base));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.segundosRestantes).toBe(TTL / 1000);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current.segundosRestantes).toBe(TTL / 1000 - 3);
  });

  it("renova sozinho quando o contador zera (FR-03)", async () => {
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    renderHook(() => useQrRefresh(base));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(TTL); });
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it(">>> FR-04: para apos 3 ciclos e nao renova mais", async () => {
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    const { result } = renderHook(() => useQrRefresh(base));

    // Avanca em passos de um TTL: um salto unico nao deixa as promises de
    // buscar() intercalarem entre os ticks do contador.
    for (let i = 0; i < 8; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(TTL); });
    }

    expect(result.current.pausado).toBe(true);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(MAX_CICLOS + 1);
  });

  it("gerarNovo() reinicia o ciclo apos a pausa", async () => {
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr());
    const { result } = renderHook(() => useQrRefresh(base));
    for (let i = 0; i < 8; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(TTL); });
    }
    expect(result.current.pausado).toBe(true);

    const antes = spy.mock.calls.length;
    await act(async () => { result.current.gerarNovo(); await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.pausado).toBe(false);
    expect(spy.mock.calls.length).toBe(antes + 1);
  });

  it("avisa quando ja esta conectado, sem mostrar QR (FR-09)", async () => {
    vi.spyOn(api, "gerarQrCode").mockResolvedValue({
      qrcode: null, paircode: null, status: "connected", qr_ttl_ms: TTL,
    });
    const onConectado = vi.fn();
    const { result } = renderHook(() => useQrRefresh({ ...base, onConectado }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(onConectado).toHaveBeenCalledTimes(1);
    expect(result.current.qrcode).toBeNull();
  });

  it("erro terminal avisa e nao insiste", async () => {
    vi.spyOn(api, "gerarQrCode").mockRejectedValue(new api.ApiError("invalid_token"));
    const onErro = vi.fn();
    renderHook(() => useQrRefresh({ ...base, onErro }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onErro).toHaveBeenCalledWith("invalid_token");
  });

  it(">>> FR-03: falha ao renovar MANTEM o QR anterior na tela", async () => {
    // Trocar por tela de erro tiraria da pessoa um codigo que ainda pode
    // funcionar — e ela ja esta com o celular na mao.
    const spy = vi.spyOn(api, "gerarQrCode").mockResolvedValue(respostaQr("data:image/png;base64,PRIMEIRO"));
    const { result } = renderHook(() => useQrRefresh(base));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const primeiro = result.current.qrcode;

    spy.mockRejectedValue(new api.ApiError("provider_error"));
    await act(async () => { await vi.advanceTimersByTimeAsync(TTL); });

    expect(result.current.qrcode).toBe(primeiro);
    expect(result.current.falhaAoRenovar).toBe(true);
  });

  it("dois cliques em gerarNovo nao disparam duas chamadas (FR-04)", async () => {
    let liberar!: (v: unknown) => void;
    const pendente = new Promise((r) => { liberar = r; });
    const spy = vi.spyOn(api, "gerarQrCode").mockImplementation(
      () => pendente as Promise<api.ConnectResponse>,
    );
    const { result } = renderHook(() => useQrRefresh(base));

    await act(async () => {
      result.current.gerarNovo();
      result.current.gerarNovo();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    await act(async () => { liberar(respostaQr()); });
  });
});
