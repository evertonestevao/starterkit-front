import { describe, expect, it } from "vitest";
import { textoDoPedidoDaRede, totalDaRede } from "./ebdRevistas";

const REVISTAS = [
  { id: "r1", titulo: "Adultos - aluno" },
  { id: "r2", titulo: "Jovens - aluno" },
  { id: "r3", titulo: "Primários - aluno" },
];

describe("total da rede (revistas)", () => {
  it("soma a igreja, as congregações do sistema e as de fora, por revista e por igreja", () => {
    const t = totalDaRede(
      {
        igrejas: [
          {
            churchId: "lins",
            nome: "AD Lins",
            propria: true,
            pedidos: 10,
            itens: [
              { revistaId: "r1", quantidade: 8 },
              { revistaId: "r2", quantidade: 4 },
            ],
          },
          {
            churchId: "vila",
            nome: "Congregação Vila",
            propria: false,
            pedidos: 3,
            itens: [{ revistaId: "r1", quantidade: 3 }],
          },
          { churchId: "nova", nome: "Congregação Nova", propria: false, pedidos: 0, itens: [] },
        ],
        externos: [{ id: "e1", nome: "Congregação Sítio", itens: [{ revistaId: "r2", quantidade: 5 }] }],
      },
      REVISTAS,
    );
    // Primários: ninguém pediu, não entra.
    expect(t.linhas.map((l) => [l.titulo, l.total, l.quantidades])).toEqual([
      ["Adultos - aluno", 11, [8, 3, 0, 0]],
      ["Jovens - aluno", 9, [4, 0, 0, 5]],
    ]);
    expect(t.colunas.map((c) => [c.nome, c.total, c.externo, c.pedidos])).toEqual([
      ["AD Lins", 12, false, 10],
      ["Congregação Vila", 3, false, 3],
      ["Congregação Nova", 0, false, 0],
      ["Congregação Sítio", 5, true, null],
    ]);
    expect(t.total).toBe(20);
    expect(textoDoPedidoDaRede({ igreja: "AD Lins", trimestre: "1º trimestre de 2027", rede: t }).split("\n")).toEqual([
      "Pedido de revistas da EBD - 1º trimestre de 2027",
      "AD Lins e congregações",
      "",
      "11 x Adultos - aluno",
      "9 x Jovens - aluno",
      "",
      "Total: 20 revistas",
    ]);
  });

  it("sem pedido nenhum, sem linhas e total zero", () => {
    const t = totalDaRede(
      { igrejas: [{ churchId: "a", nome: "A", propria: true, pedidos: 0, itens: [] }], externos: [] },
      REVISTAS,
    );
    expect(t.linhas).toEqual([]);
    expect(t.total).toBe(0);
  });
});
