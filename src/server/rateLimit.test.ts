import { describe, expect, it, vi } from "vitest";
import { createMemoryRateLimiter, createUpstashRateLimiter } from "./rateLimit";

/** Mock do Upstash REST: INCR por chave, sem rede. */
function makeUpstashMock() {
  const counters = new Map<string, number>();
  const requests: Array<{ url: string; auth: string | undefined; commands: unknown[][] }> = [];

  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const commands = JSON.parse(String(init?.body)) as unknown[][];
    requests.push({
      url: String(url),
      auth: (init?.headers as Record<string, string>)?.Authorization,
      commands,
    });
    const key = String(commands[0][1]);
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return {
      ok: true,
      json: async () => [{ result: count }, { result: 1 }],
    } as Response;
  }) as typeof fetch;

  return { fetchFn, requests, counters };
}

describe("createUpstashRateLimiter", () => {
  const baseConfig = {
    limit: 2,
    windowMs: 1000,
    restUrl: "https://fake.upstash.io/",
    restToken: "tok-teste",
  };

  it("permite até o limite e bloqueia o excedente na mesma janela", async () => {
    const { fetchFn } = makeUpstashMock();
    const limiter = createUpstashRateLimiter({ ...baseConfig, fetchFn, now: () => 500 });

    await limiter.consume("login:a@b.com");
    await limiter.consume("login:a@b.com");
    await expect(limiter.consume("login:a@b.com")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("janela nova zera o contador (chave inclui o id da janela)", async () => {
    const { fetchFn } = makeUpstashMock();
    let clock = 500;
    const limiter = createUpstashRateLimiter({ ...baseConfig, fetchFn, now: () => clock });

    await limiter.consume("k");
    await limiter.consume("k");
    await expect(limiter.consume("k")).rejects.toMatchObject({ code: "rate_limited" });

    clock = 1500; // próxima janela de 1000ms
    await expect(limiter.consume("k")).resolves.toBeUndefined();
  });

  it("chaves diferentes têm contadores independentes", async () => {
    const { fetchFn } = makeUpstashMock();
    const limiter = createUpstashRateLimiter({ ...baseConfig, fetchFn, now: () => 500 });
    await limiter.consume("a");
    await limiter.consume("a");
    await expect(limiter.consume("b")).resolves.toBeUndefined();
  });

  it("envia pipeline INCR+PEXPIRE autenticado para a URL do Upstash", async () => {
    const { fetchFn, requests } = makeUpstashMock();
    const limiter = createUpstashRateLimiter({ ...baseConfig, fetchFn, now: () => 500 });
    await limiter.consume("k");

    expect(requests[0].url).toBe("https://fake.upstash.io/pipeline");
    expect(requests[0].auth).toBe("Bearer tok-teste");
    expect(requests[0].commands[0]).toEqual(["INCR", "ratelimit:k:0"]);
    expect(requests[0].commands[1]).toEqual(["PEXPIRE", "ratelimit:k:0", "1000", "NX"]);
  });

  it("falha ABERTO quando o Upstash está fora, com WARN explícito e grepável", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingFetch = (async () => {
      throw new Error("rede fora");
    }) as typeof fetch;
    const limiter = createUpstashRateLimiter({ ...baseConfig, fetchFn: failingFetch });

    await expect(limiter.consume("k")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("FAIL-OPEN");
    warnSpy.mockRestore();
  });
});

describe("createMemoryRateLimiter (comportamento preservado)", () => {
  it("continua bloqueando na janela deslizante", async () => {
    let clock = 0;
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 100, now: () => clock });
    await limiter.consume("k");
    await expect(limiter.consume("k")).rejects.toMatchObject({ code: "rate_limited" });
    clock = 101;
    await expect(limiter.consume("k")).resolves.toBeUndefined();
  });
});
