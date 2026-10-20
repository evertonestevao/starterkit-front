import { describe, expect, it } from "vitest";
import { ordenarFrequencia, type LinhaFrequencia } from "./frequencia-tabela";

const linha = (nome: string, percentual: number | null, ausentes = 0): LinhaFrequencia => ({
  key: nome,
  nome,
  href: "#",
  presentes: 0,
  justificados: 0,
  ausentes,
  percentual,
});

const linhas = [linha("Bruna", 33.3, 10), linha("Ana", 80, 3), linha("Caio", null), linha("Átila", 80, 3)];

describe("ordenarFrequencia", () => {
  it("por nome, com acento no lugar certo", () => {
    expect(ordenarFrequencia(linhas, "nome", true).map((l) => l.nome)).toEqual(["Ana", "Átila", "Bruna", "Caio"]);
    expect(ordenarFrequencia(linhas, "nome", false).map((l) => l.nome)).toEqual(["Caio", "Bruna", "Átila", "Ana"]);
  });

  it("por presença: sem presença (null) fica no fim nas duas direções; empate vai por nome", () => {
    expect(ordenarFrequencia(linhas, "percentual", true).map((l) => l.nome)).toEqual(["Bruna", "Ana", "Átila", "Caio"]);
    expect(ordenarFrequencia(linhas, "percentual", false).map((l) => l.nome)).toEqual(["Ana", "Átila", "Bruna", "Caio"]);
  });

  it("por ausências, do maior para o menor", () => {
    expect(ordenarFrequencia(linhas, "ausentes", false)[0].nome).toBe("Bruna");
  });
});
