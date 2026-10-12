import { describe, expect, it } from "vitest";
import { faixaDeFrequencia } from "./ebd";

describe("faixa da frequência", () => {
  it("acima de 70% alta, de 40% a 70% média, abaixo de 40% baixa, sem chamada sem faixa", () => {
    expect(faixaDeFrequencia(100)).toBe("alta");
    expect(faixaDeFrequencia(70.1)).toBe("alta");
    expect(faixaDeFrequencia(70)).toBe("media");
    expect(faixaDeFrequencia(40)).toBe("media");
    expect(faixaDeFrequencia(39.9)).toBe("baixa");
    expect(faixaDeFrequencia(0)).toBe("baixa");
    expect(faixaDeFrequencia(null)).toBe("sem");
  });
});
