import { describe, expect, it } from "vitest";
import { formatMonthShort, lastMonths, pivotVisitsByChurch } from "./visitMetrics";

describe("lastMonths", () => {
  it("conta a partir do mês de Brasília, virando o ano", () => {
    // 01/02 00:30 em UTC ainda é 31/01 em Brasília.
    expect(lastMonths(3, new Date("2026-02-01T00:30:00Z"))).toEqual([
      "2026-01-01",
      "2025-12-01",
      "2025-11-01",
    ]);
  });
});

describe("pivotVisitsByChurch", () => {
  const meses = ["2026-09-01", "2026-08-01"];

  it("põe zero no mês sem visita e ordena por total", () => {
    const tabela = pivotVisitsByChurch(
      [
        { churchId: "a", churchName: "Igreja A", mes: "2026-09-01", visitas: 3 },
        { churchId: "b", churchName: "Igreja B", mes: "2026-09-01", visitas: 10 },
        { churchId: "b", churchName: "Igreja B", mes: "2026-08-01", visitas: 5 },
      ],
      meses,
    );

    expect(tabela).toEqual([
      { churchId: "b", churchName: "Igreja B", porMes: [10, 5], total: 15 },
      { churchId: "a", churchName: "Igreja A", porMes: [3, 0], total: 3 },
    ]);
  });

  it("ignora mês fora da janela pedida", () => {
    const tabela = pivotVisitsByChurch(
      [{ churchId: "a", churchName: "A", mes: "2025-01-01", visitas: 99 }],
      meses,
    );
    expect(tabela).toEqual([]);
  });
});

describe("formatMonthShort", () => {
  it("formata mês curto em português", () => {
    expect(formatMonthShort("2026-09-01")).toBe("set/26");
  });
});
