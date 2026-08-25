/**
 * Valida: FR-06 (detecta conexao), FR-19 (teto do polling)
 * Mitiga: R-06 — polling ilimitado esgota a cota de invocacoes
 *
 * A versao anterior deste arquivo verificava apenas que a CONSTANTE do teto
 * valia 5 minutos. Constante certa com hook que nao para e exatamente o bug que
 * o teto existe para impedir — entao aqui o comportamento e exercido de fato.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useConnectionPoll, TETO_POLLING_MS } from "../../src/features/connect/hooks/useConnectionPoll";
import * as api from "../../src/features/connect/api";

const base = {
  instance: "INST",
  token: "tok",
  intervaloMs: 5_000,
  ativo: true,
  onConectado: () => {},
  onErro: () => {},
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useConnectionPoll", () => {
  it("nao consulta nada antes do primeiro intervalo", () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    renderHook(() => useConnectionPoll(base));
    expect(spy).not.toHaveBeenCalled();
  });

  it("consulta periodicamente enquanto desconectado", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    renderHook(() => useConnectionPoll(base));

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("PARA de consultar assim que conecta", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "connected" });
    const onConectado = vi.fn();
    renderHook(() => useConnectionPoll({ ...base, onConectado }));

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(onConectado).toHaveBeenCalledTimes(1);

    // Mais um minuto inteiro: nenhuma consulta nova.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it(">>> R-06: para no teto de 5 minutos e NAO consulta indefinidamente", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    const { result } = renderHook(() => useConnectionPoll(base));

    // Avanca uma hora inteira. Sem o teto, seriam 720 chamadas (R-06).
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });

    expect(result.current.pausadoPorTempo).toBe(true);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(TETO_POLLING_MS / base.intervaloMs);
    expect(spy.mock.calls.length).toBeLessThan(70);
  });

  it("retomar() reinicia a janela apos a pausa", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    const { result } = renderHook(() => useConnectionPoll(base));

    await act(async () => { await vi.advanceTimersByTimeAsync(TETO_POLLING_MS + 10_000); });
    expect(result.current.pausadoPorTempo).toBe(true);

    const antes = spy.mock.calls.length;
    act(() => result.current.retomar());
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(result.current.pausadoPorTempo).toBe(false);
    expect(spy.mock.calls.length).toBeGreaterThan(antes);
  });

  it("nao consulta quando inativo", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    renderHook(() => useConnectionPoll({ ...base, ativo: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(spy).not.toHaveBeenCalled();
  });

  it("erro terminal para o polling e avisa", async () => {
    vi.spyOn(api, "consultarStatus").mockRejectedValue(new api.ApiError("invalid_token"));
    const onErro = vi.fn();
    const spy = vi.spyOn(api, "consultarStatus");
    renderHook(() => useConnectionPoll({ ...base, onErro }));

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(onErro).toHaveBeenCalledWith("invalid_token");

    const antes = spy.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(spy.mock.calls.length).toBe(antes);
  });

  it("erro transitorio NAO para o polling — segue ate o teto", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockRejectedValue(new api.ApiError("provider_error"));
    const onErro = vi.fn();
    renderHook(() => useConnectionPoll({ ...base, onErro }));

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(onErro).not.toHaveBeenCalled();
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it("pausa com a aba em segundo plano e retoma ao voltar", async () => {
    const spy = vi.spyOn(api, "consultarStatus").mockResolvedValue({ status: "disconnected" });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    renderHook(() => useConnectionPoll(base));

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(spy).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });
});
