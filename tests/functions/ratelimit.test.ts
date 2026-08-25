// @vitest-environment node
/**
 * Valida: FR-16 (limite de tentativas), R-06 (cota de invocacao), SEC-07
 */
import { describe, it, expect } from "vitest";
import {
  evaluate,
  windowStart,
  WINDOW_MINUTES,
  MAX_FAILURES_PER_IP,
  MAX_REQUESTS_PER_INSTANCE,
} from "../../supabase/functions/_shared/ratelimit.ts";

describe("evaluate", () => {
  it("libera quando nao ha nada contado", () => {
    expect(evaluate({ ipFailures: 0, instanceRequests: 0 }).limited).toBe(false);
  });

  it("bloqueia ao atingir o limite de falhas por origem", () => {
    const v = evaluate({ ipFailures: MAX_FAILURES_PER_IP, instanceRequests: 0 });
    expect(v.limited).toBe(true);
    expect(v.reason).toBe("ip_failures");
    expect(v.retryAfterSeconds).toBe(WINDOW_MINUTES * 60);
  });

  it("libera uma falha antes do limite", () => {
    expect(evaluate({ ipFailures: MAX_FAILURES_PER_IP - 1, instanceRequests: 0 }).limited).toBe(
      false,
    );
  });

  it("bloqueia ao atingir o limite por instancia", () => {
    const v = evaluate({ ipFailures: 0, instanceRequests: MAX_REQUESTS_PER_INSTANCE });
    expect(v.limited).toBe(true);
    expect(v.reason).toBe("instance_requests");
  });

  it("NAO bloqueia uma sessao legitima completa", () => {
    // Este e o teste que importa: o limite tem que barrar varredura sem
    // atrapalhar quem esta so reconectando.
    // Polling de 5 min a cada 5s = 60 chamadas, + 1 sessao + 4 geracoes de QR.
    const sessaoLegitima = 60 + 1 + 4;
    expect(sessaoLegitima).toBeLessThan(MAX_REQUESTS_PER_INSTANCE);
    expect(evaluate({ ipFailures: 0, instanceRequests: sessaoLegitima }).limited).toBe(false);
  });

  it("deixa folga de pelo menos 3x sobre a sessao legitima", () => {
    expect(MAX_REQUESTS_PER_INSTANCE / 65).toBeGreaterThan(3);
  });

  it("falha por origem tem precedencia sobre volume por instancia", () => {
    const v = evaluate({
      ipFailures: MAX_FAILURES_PER_IP,
      instanceRequests: MAX_REQUESTS_PER_INSTANCE,
    });
    expect(v.reason).toBe("ip_failures");
  });
});

describe("windowStart", () => {
  it("recua exatamente a janela configurada", () => {
    const agora = new Date("2026-08-24T12:00:00Z");
    expect(windowStart(agora).toISOString()).toBe("2026-08-24T11:50:00.000Z");
  });
});
