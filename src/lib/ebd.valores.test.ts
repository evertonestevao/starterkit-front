import { describe, expect, it } from "vitest";
import { valoresDoPeriodo } from "./ebd";

const classe = (classeNome: string, aulas: number, ofertaCentavos: number, biblias = 0, revistas = 0) => ({
  classeId: classeNome,
  classeNome,
  aulas,
  ofertaCentavos,
  biblias,
  revistas,
});

describe("valores do período (relatório da EBD)", () => {
  it("soma as ofertas, tira a média por domingo e mostra a parte de cada classe", () => {
    const v = valoresDoPeriodo(
      [classe("Adultos", 2, 9000, 10, 6), classe("Jovens", 0, 0), classe("Primários", 1, 3000, 2, 1)],
      2,
    );
    expect(v.totalCentavos).toBe(12000);
    expect(v.mediaPorDomingoCentavos).toBe(6000);
    expect([v.biblias, v.revistas]).toEqual([12, 7]);
    expect(v.porClasse.map((c) => [c.classeNome, c.centavos, c.percentual])).toEqual([
      ["Adultos", 9000, 75],
      ["Primários", 3000, 25],
    ]);
  });

  it("sem domingo com chamada não há média, e sem oferta a parte de cada classe é zero", () => {
    expect(valoresDoPeriodo([], 0).mediaPorDomingoCentavos).toBeNull();
    expect(valoresDoPeriodo([classe("Adultos", 1, 0)], 1).porClasse[0].percentual).toBe(0);
  });
});
