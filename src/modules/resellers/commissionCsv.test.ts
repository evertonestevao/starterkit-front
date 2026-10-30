import { describe, expect, it } from "vitest";
import { buildCommissionsCsv, withDefaultPeriod } from "./commissionCsv";
import type { AdminCommission } from "./types";

function commission(overrides: Partial<AdminCommission>): AdminCommission {
  return {
    id: "1",
    reseller_id: "r1",
    reseller_name: "Maria",
    client_name: "Cliente",
    plan_id: "p1",
    plan_name: "Pro",
    base_amount_cents: 10000,
    months_covered: 1,
    commission_type: "percent",
    commission_percent: 30,
    commission_fixed_cents: null,
    amount_cents: 3000,
    status: "pending",
    paid_at: null,
    refund_flagged_at: null,
    created_at: "2026-10-15T10:00:00Z",
    ...overrides,
  };
}

describe("buildCommissionsCsv", () => {
  it("abre em colunas no Excel pt-BR: BOM, ponto e vírgula e decimal com vírgula", () => {
    const csv = buildCommissionsCsv([commission({})]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Maria;Cliente;Pro;2026-10-15;100,00;30,00;Pendente;");
  });

  it("totaliza por vendedor, sem contar revertido", () => {
    const csv = buildCommissionsCsv([
      commission({}),
      commission({ status: "paid", amount_cents: 1000, paid_at: "2026-10-20T12:00:00Z" }),
      commission({ status: "reversed", amount_cents: 9999 }),
      commission({ reseller_name: "Ana", amount_cents: 500 }),
    ]);
    const lines = csv.split("\r\n");
    const header = lines.indexOf("Total por vendedor;Pendente;Pago;Total");
    expect(lines.slice(header + 1, header + 3)).toEqual(["Ana;5,00;0,00;5,00", "Maria;30,00;10,00;40,00"]);
  });

  it("neutraliza fórmula em nome digitado por terceiros", () => {
    const csv = buildCommissionsCsv([commission({ client_name: '=HYPERLINK("http://x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toContain(";=HYPERLINK");
  });

  it("escapa separador e aspas", () => {
    const csv = buildCommissionsCsv([commission({ client_name: 'A;B "C"' })]);
    expect(csv).toContain('"A;B ""C"""');
  });

  it("sem lançamentos, só cabeçalhos", () => {
    expect(buildCommissionsCsv([])).toContain("Total por vendedor");
  });
});

describe("withDefaultPeriod", () => {
  const now = new Date("2026-02-15T12:00:00Z");

  it("sem período na tela, usa o mês atual até o último dia", () => {
    expect(withDefaultPeriod({ status: "paid" }, now)).toEqual({
      status: "paid",
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("respeita o período filtrado", () => {
    expect(withDefaultPeriod({ from: "2026-01-10" }, now)).toEqual({ from: "2026-01-10" });
  });
});
