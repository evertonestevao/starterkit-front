import { describe, expect, it } from "vitest";
import {
  allocatePositions,
  formatCents,
  marginalPriceForNext,
  normalizeTiers,
  priceForPosition,
  totalForCount,
  type PriceTier,
} from "./sponsorPricing";

const TIERS: PriceTier[] = [
  { position: 1, amountCents: 3990 },
  { position: 2, amountCents: 3490 },
  { position: 3, amountCents: 2990 },
  { position: 4, amountCents: 2790 },
];

describe("priceForPosition", () => {
  it("usa o tier da posição e repete o último dali em diante", () => {
    expect(priceForPosition(1, TIERS)).toBe(3990);
    expect(priceForPosition(3, TIERS)).toBe(2990);
    expect(priceForPosition(4, TIERS)).toBe(2790);
    expect(priceForPosition(9, TIERS)).toBe(2790);
  });

  it("não depende da ordem em que a tabela chega", () => {
    expect(priceForPosition(1, [...TIERS].reverse())).toBe(3990);
  });

  it("recusa posição inválida", () => {
    expect(() => priceForPosition(0, TIERS)).toThrow();
    expect(() => priceForPosition(1.5, TIERS)).toThrow();
  });
});

describe("totalForCount", () => {
  it("soma as posições 1..N", () => {
    expect(totalForCount(0, TIERS)).toBe(0);
    expect(totalForCount(1, TIERS)).toBe(3990);
    expect(totalForCount(2, TIERS)).toBe(7480);
    expect(totalForCount(3, TIERS)).toBe(10470);
    expect(totalForCount(4, TIERS)).toBe(13260);
    expect(totalForCount(5, TIERS)).toBe(16050);
  });

  it("valor marginal da próxima igreja é o tier da posição seguinte", () => {
    expect(marginalPriceForNext(0, TIERS)).toBe(3990);
    expect(marginalPriceForNext(2, TIERS)).toBe(2990);
    expect(marginalPriceForNext(7, TIERS)).toBe(2790);
  });
});

describe("allocatePositions", () => {
  const A = { id: "a", rankedAt: "2026-01-01T00:00:00Z", church: "A" };
  const B = { id: "b", rankedAt: "2026-02-01T00:00:00Z", church: "B" };
  const C = { id: "c", rankedAt: "2026-03-01T00:00:00Z", church: "C" };

  it("mais antigo ocupa a posição 1", () => {
    const result = allocatePositions([C, A, B], TIERS);
    expect(result.map((r) => [r.sponsorship.church, r.position, r.amountCents])).toEqual([
      ["A", 1, 3990],
      ["B", 2, 3490],
      ["C", 3, 2990],
    ]);
  });

  it("cancelar a igreja mais cara RECALCULA — não sobra B=34,90 + C=29,90", () => {
    // Cenário do enunciado: A saiu. O total volta a ser posição 1 + posição 2.
    const result = allocatePositions([B, C], TIERS);
    expect(result.map((r) => [r.sponsorship.church, r.amountCents])).toEqual([
      ["B", 3990],
      ["C", 3490],
    ]);
    const total = result.reduce((sum, r) => sum + r.amountCents, 0);
    expect(total).toBe(7480);
    expect(total).not.toBe(3490 + 2990);
  });

  it("a soma alocada é sempre o total da quantidade", () => {
    for (let n = 0; n <= 8; n += 1) {
      const list = Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        rankedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }));
      const sum = allocatePositions(list, TIERS).reduce((acc, r) => acc + r.amountCents, 0);
      expect(sum).toBe(totalForCount(n, TIERS));
    }
  });

  it("empate de data desempata pelo id, sempre na mesma ordem", () => {
    const x = { id: "x", rankedAt: "2026-01-01T00:00:00Z" };
    const y = { id: "y", rankedAt: "2026-01-01T00:00:00Z" };
    const first = allocatePositions([y, x], TIERS).map((r) => r.sponsorship.id);
    const second = allocatePositions([x, y], TIERS).map((r) => r.sponsorship.id);
    expect(first).toEqual(["x", "y"]);
    expect(second).toEqual(first);
  });
});

describe("normalizeTiers", () => {
  it("recusa tabela vazia, com buraco ou valor inválido", () => {
    expect(() => normalizeTiers([])).toThrow();
    expect(() =>
      normalizeTiers([
        { position: 1, amountCents: 3990 },
        { position: 3, amountCents: 2990 },
      ]),
    ).toThrow();
    expect(() => normalizeTiers([{ position: 1, amountCents: 0 }])).toThrow();
    expect(() => normalizeTiers([{ position: 1, amountCents: 39.9 }])).toThrow();
  });
});

describe("formatCents", () => {
  it("formata em reais", () => {
    expect(formatCents(3990).replace(/\s/g, " ")).toBe("R$ 39,90");
  });
});
