import { describe, expect, it } from "vitest";
import { commissionFiltersSchema, parseCents, parseDecimal, toCommissionColumns } from "./schemas";

describe("parseDecimal", () => {
  it.each([
    ["30", 30],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["1.234,56", 1234.56],
  ])("%s vira %d", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(["", "abc", "-1", "1,2,3", null])("%s é inválido", (input) => {
    expect(parseDecimal(input)).toBeNaN();
  });
});

describe("parseCents", () => {
  it("evita erro de ponto flutuante", () => {
    expect(parseCents("19,90")).toBe(1990);
    expect(parseCents("1.234,56")).toBe(123456);
  });
});

describe("toCommissionColumns", () => {
  it("percentual preenche só a coluna de percentual", () => {
    expect(toCommissionColumns("percent", "30")).toEqual({ commission_percent: 30, commission_fixed_cents: null });
  });

  it("fixo preenche só os centavos", () => {
    expect(toCommissionColumns("fixed", "19,90")).toEqual({ commission_percent: null, commission_fixed_cents: 1990 });
  });

  it.each([
    ["percent", "101"],
    ["percent", "abc"],
    ["fixed", "abc"],
  ] as const)("%s com %s é recusado", (type, value) => {
    expect(() => toCommissionColumns(type, value)).toThrow();
  });
});

describe("commissionFiltersSchema", () => {
  it("ignora valores inválidos da URL em vez de falhar", () => {
    expect(commissionFiltersSchema.parse({ reseller: "x", status: "y", from: "ontem" })).toEqual({});
  });

  it("mantém os válidos", () => {
    expect(commissionFiltersSchema.parse({ status: "paid", from: "2026-10-01" })).toEqual({
      status: "paid",
      from: "2026-10-01",
    });
  });
});
