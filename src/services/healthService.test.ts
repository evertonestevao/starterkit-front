import { describe, expect, it } from "vitest";
import { createHealthService } from "./healthService";

const fixedNow = () => new Date("2026-10-26T12:00:00Z");

describe("healthService", () => {
  it("ok quando todas as checagens passam", async () => {
    const health = createHealthService({ checks: { database: async () => {} }, now: fixedNow });
    await expect(health.run()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" },
      timestamp: "2026-10-26T12:00:00.000Z",
    });
  });

  it("fail sem vazar a mensagem do erro", async () => {
    const failures: string[] = [];
    const health = createHealthService({
      checks: {
        database: async () => {
          throw new Error("senha do banco errada");
        },
      },
      onFailure: (name) => failures.push(name),
    });
    const report = await health.run();
    expect(report.status).toBe("fail");
    expect(report.checks).toEqual({ database: "fail" });
    expect(JSON.stringify(report)).not.toContain("senha");
    expect(failures).toEqual(["database"]);
  });

  it("checagem lenta estoura o timeout", async () => {
    const health = createHealthService({
      checks: { database: () => new Promise((resolve) => setTimeout(resolve, 200)) },
      timeoutMs: 10,
    });
    await expect(health.run()).resolves.toMatchObject({ status: "fail" });
  });
});
