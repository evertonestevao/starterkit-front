import { describe, expect, it } from "vitest";
import {
  faltaDoPedido,
  filtrarPedidos,
  resumoDaCompra,
  resumoDosPedidos,
  situacaoDoPagamento,
  textoDoResumoDaCompra,
  totalDoPedido,
} from "./ebdRevistas";
import type { EbdRevistaPedido } from "@/types/ebdRevistas";

function pedido(over: Partial<EbdRevistaPedido>): EbdRevistaPedido {
  return {
    id: "p",
    membroId: "m",
    nome: "Fulano",
    telefone: null,
    deFora: false,
    classeNome: "Adultos",
    observacao: null,
    entregueEm: null,
    cancelado: false,
    criadoEm: "2026-10-01T12:00:00Z",
    itens: [{ revistaId: "r1", titulo: "Adultos - aluno", quantidade: 1, precoCentavos: 1200 }],
    pagamentos: [],
    ...over,
  };
}
const pago = (valorCentavos: number) => ({
  id: "g" + valorCentavos,
  valorCentavos,
  data: "2026-10-05",
  forma: "pix" as const,
});

const ANA = pedido({ id: "a", nome: "Ana", pagamentos: [pago(1200)], entregueEm: "2026-10-06" });
const BIA = pedido({
  id: "b",
  nome: "Bia",
  classeNome: "Jovens",
  itens: [
    { revistaId: "r1", titulo: "Adultos - aluno", quantidade: 2, precoCentavos: 1200 },
    { revistaId: "r2", titulo: "Jovens - aluno", quantidade: 1, precoCentavos: 1500 },
  ],
  pagamentos: [pago(1000)],
});
const CAIO = pedido({ id: "c", nome: "Caio", deFora: true, membroId: null, classeNome: null });
const DORA = pedido({ id: "d", nome: "Dora", cancelado: true, pagamentos: [pago(500)] });
const TODOS = [ANA, BIA, CAIO, DORA];

describe("pedidos de revista", () => {
  it("total, falta e situação do pagamento (pago, parcial, aberto)", () => {
    expect(totalDoPedido(BIA)).toBe(3900);
    expect(faltaDoPedido(BIA)).toBe(2900);
    expect([ANA, BIA, CAIO].map(situacaoDoPagamento)).toEqual(["pago", "parcial", "aberto"]);
    // Revista de graça não fica "devendo".
    expect(
      situacaoDoPagamento(pedido({ itens: [{ revistaId: "r", titulo: "Brinde", quantidade: 1, precoCentavos: 0 }] })),
    ).toBe("pago");
  });

  it("filtros: situação, revista, classe e nome; cancelado só no filtro dele", () => {
    const f = (over: Partial<Parameters<typeof filtrarPedidos>[1]>) =>
      filtrarPedidos(TODOS, { situacao: "todos", revistaId: "", classe: "", busca: "", ...over }).map((p) => p.nome);
    expect(f({})).toEqual(["Ana", "Bia", "Caio"]);
    expect(f({ situacao: "devendo" })).toEqual(["Bia", "Caio"]);
    expect(f({ situacao: "pagos" })).toEqual(["Ana"]);
    expect(f({ situacao: "a_entregar" })).toEqual(["Bia", "Caio"]);
    expect(f({ situacao: "entregues" })).toEqual(["Ana"]);
    expect(f({ situacao: "cancelados" })).toEqual(["Dora"]);
    expect(f({ revistaId: "r2" })).toEqual(["Bia"]);
    expect(f({ classe: "Adultos" })).toEqual(["Ana"]);
    expect(f({ busca: "cáio" })).toEqual(["Caio"]);
  });

  it("resumo do trimestre não conta o cancelado, mas mostra o dinheiro que entrou nele", () => {
    expect(resumoDosPedidos(TODOS)).toEqual({
      pedidos: 3,
      revistas: 5,
      totalCentavos: 6300,
      recebidoCentavos: 2200,
      aReceberCentavos: 4100,
      devendo: 2,
      entregues: 1,
      aEntregar: 2,
      recebidoEmCanceladosCentavos: 500,
    });
  });

  it("lista de compra: quantas de cada revista, e o texto para mandar ao fornecedor", () => {
    const linhas = resumoDaCompra(TODOS);
    expect(linhas).toEqual([
      { revistaId: "r1", titulo: "Adultos - aluno", quantidade: 4, valorCentavos: 4800 },
      { revistaId: "r2", titulo: "Jovens - aluno", quantidade: 1, valorCentavos: 1500 },
    ]);
    const texto = textoDoResumoDaCompra({ igreja: "AD Lins", trimestre: "1º trimestre de 2027", linhas });
    expect(texto.split("\n")).toEqual([
      "Pedido de revistas da EBD - 1º trimestre de 2027",
      "AD Lins",
      "",
      "4 x Adultos - aluno",
      "1 x Jovens - aluno",
      "",
      expect.stringMatching(/^Total: 5 revistas \(R\$\s63,00\)$/),
    ]);
  });
});
