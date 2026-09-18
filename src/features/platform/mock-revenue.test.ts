import { describe, expect, it } from "vitest";
import { buildRevenueSample } from "./mock-revenue";

/**
 * A amostra só é útil se for coerente: um painel de demonstração com números
 * que não batem entre si ensina a desconfiar do painel real que vier depois.
 */
describe("buildRevenueSample", () => {
  const amostra = buildRevenueSample(new Date("2026-09-18T12:00:00-03:00"));

  it("o mês corrente é a soma das faixas, com o desconto por posição", () => {
    const somaFaixas = amostra.faixas.reduce((soma, f) => soma + f.receitaCents, 0);
    expect(amostra.recebidoNoMesCents).toBe(somaFaixas);
    // 48×39,90 + 17×74,80 + 6×104,70 + 4×132,60
    expect(somaFaixas).toBe(434_540);
  });

  it("a participação das faixas fecha em 100%", () => {
    const total = amostra.faixas.reduce((soma, f) => soma + f.participacao, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("ticket médio é o total dividido pelos patrocinadores", () => {
    expect(amostra.ticketMedioCents).toBe(Math.round(434_540 / amostra.patrocinadores));
  });

  it("série de 12 meses, terminando no mês corrente", () => {
    expect(amostra.porMes).toHaveLength(12);
    expect(amostra.porMes.at(-1)?.mes).toBe("set/26");
  });
});
