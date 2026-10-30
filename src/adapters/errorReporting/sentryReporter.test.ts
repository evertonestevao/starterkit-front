import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { createSentryReporter, parseSentryDsn } from "./sentryReporter";

const DSN = "https://abc123@o1.ingest.sentry.io/4567";

describe("parseSentryDsn", () => {
  it("monta a URL de envelope e a chave pública", () => {
    expect(parseSentryDsn(DSN)).toEqual({
      envelopeUrl: "https://o1.ingest.sentry.io/api/4567/envelope/",
      publicKey: "abc123",
    });
  });

  it("rejeita DSN sem chave ou projeto", () => {
    expect(() => parseSentryDsn("https://o1.ingest.sentry.io/")).toThrow();
  });
});

describe("createSentryReporter", () => {
  it("envia o evento com contexto sanitizado", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const reporter = createSentryReporter({ dsn: DSN, environment: "test", fetchFn });

    await reporter.captureException(new AppError("internal_error", "falhou", { hint: "x" }), {
      source: "action",
      extra: { companyId: "c1", password: "segredo", token: "t" },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.sentry.io/api/4567/envelope/");
    const body = String(init.body);
    const event = JSON.parse(body.split("\n")[2]);
    expect(event.environment).toBe("test");
    expect(event.tags).toEqual({ source: "action" });
    expect(event.exception.values[0]).toEqual({ type: "AppError", value: "falhou" });
    expect(event.extra.companyId).toBe("c1");
    expect(body).not.toContain("segredo");
    expect(event.extra).not.toHaveProperty("token");
  });

  it("nunca lança quando o Sentry falha", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn(async () => {
      throw new Error("rede caiu");
    });
    const reporter = createSentryReporter({ dsn: DSN, environment: "test", fetchFn });

    await expect(
      reporter.captureException(new Error("original"), { source: "action" }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
