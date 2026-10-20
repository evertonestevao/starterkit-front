import { describe, expect, it } from "vitest";
import { paginaDaUrl, paginar } from "./paginacao";

const lista = Array.from({ length: 45 }, (_, i) => i + 1);

describe("paginar", () => {
  it("corta a página pedida", () => {
    const p = paginar(lista, 2, 20);
    expect(p.itens[0]).toBe(21);
    expect(p.itens).toHaveLength(20);
    expect(p).toMatchObject({ pagina: 2, totalPaginas: 3, total: 45 });
  });

  it("a última página traz só o que sobra", () => {
    expect(paginar(lista, 3, 20).itens).toEqual([41, 42, 43, 44, 45]);
  });

  it("página além do fim cai na última; abaixo de 1 ou inválida, na primeira", () => {
    expect(paginar(lista, 99, 20).pagina).toBe(3);
    expect(paginar(lista, 0, 20).pagina).toBe(1);
    expect(paginar(lista, Number.NaN, 20).pagina).toBe(1);
  });

  it("lista vazia é uma página só, vazia", () => {
    expect(paginar([], 1, 20)).toEqual({ itens: [], pagina: 1, totalPaginas: 1, total: 0 });
  });
});

describe("paginaDaUrl", () => {
  it("aceita só inteiro positivo", () => {
    expect(paginaDaUrl("3")).toBe(3);
    expect(paginaDaUrl(["2", "9"])).toBe(2);
    for (const ruim of [undefined, "", "0", "-1", "1.5", "abc"]) expect(paginaDaUrl(ruim)).toBe(1);
  });
});
