import { describe, expect, it } from "vitest";
import {
  descreverItens,
  filtrarPedidos,
  normalizarCodigoVoucher,
  pedidosParaAbas,
  maximoParaPedir,
  mensagemDoComprovante,
  pedidosParaCsv,
  resumirPedidos,
  situacaoDaVenda,
  totaisPorItem,
  unidadesReservadas,
} from "./vendas";

const base = {
  status: "ativa" as const,
  pixConfirmadoEm: "2026-10-01T10:00:00Z",
  encerraEm: null,
  estoque: null,
};

describe("situacaoDaVenda", () => {
  it("sem a chave confirmada, não está aberta", () => {
    expect(
      situacaoDaVenda({ ...base, pixConfirmadoEm: null }, 0, "2026-10-08"),
    ).toBe("aguardando_pix");
  });

  it("aceita pedidos até o fim do dia de encerramento", () => {
    expect(
      situacaoDaVenda({ ...base, encerraEm: "2026-10-08" }, 0, "2026-10-08"),
    ).toBe("aberta");
    expect(
      situacaoDaVenda({ ...base, encerraEm: "2026-10-08" }, 0, "2026-10-09"),
    ).toBe("encerrada");
  });

  it("esgota quando as unidades reservadas chegam ao estoque", () => {
    expect(situacaoDaVenda({ ...base, estoque: 10 }, 9, "2026-10-08")).toBe(
      "aberta",
    );
    expect(situacaoDaVenda({ ...base, estoque: 10 }, 10, "2026-10-08")).toBe(
      "esgotada",
    );
  });

  it("encerrada à mão vence o resto", () => {
    expect(
      situacaoDaVenda(
        { ...base, status: "encerrada", pixConfirmadoEm: null },
        0,
        "2026-10-08",
      ),
    ).toBe("encerrada");
  });
});

describe("pedidos", () => {
  const pedidos = [
    { quantidade: 2, totalCents: 11000, status: "pago" as const },
    { quantidade: 1, totalCents: 5500, status: "pendente" as const },
    { quantidade: 5, totalCents: 27500, status: "cancelado" as const },
  ];

  it("cancelado não conta no estoque nem nos totais", () => {
    expect(unidadesReservadas(pedidos)).toBe(3);
    expect(resumirPedidos(pedidos)).toEqual({
      pedidos: 2,
      unidades: 3,
      entregues: 0,
      pagoCents: 11000,
      pendenteCents: 5500,
    });
  });

  it("o máximo de um pedido é o menor limite", () => {
    expect(maximoParaPedir(null, null)).toBe(1000);
    expect(maximoParaPedir(10, null)).toBe(10);
    expect(maximoParaPedir(10, 3)).toBe(3);
    expect(maximoParaPedir(null, 0)).toBe(0);
  });
});

describe("mensagemDoComprovante", () => {
  it("leva nome, quantidade, total e observação", () => {
    const msg = mensagemDoComprovante({
      titulo: "Camiseta do congresso",
      nome: "Ana Paula",
      quantidade: 3,
      totalFormatado: "R$ 165,00",
      observacao: "2 G e 1 M",
    });
    expect(msg).toContain("pedido de Camiseta do congresso");
    expect(msg).toContain("Nome: Ana Paula");
    expect(msg).toContain("Quantidade: 3");
    expect(msg).toContain("Total: R$ 165,00");
    expect(msg).toContain("Observação: 2 G e 1 M");
  });

  it("sem observação, não deixa a linha vazia", () => {
    const msg = mensagemDoComprovante({
      titulo: "Pastel",
      nome: "Bia",
      quantidade: 1,
      totalFormatado: "R$ 8,00",
      observacao: null,
    });
    expect(msg).not.toContain("Observação");
  });
});

describe("opções", () => {
  const pedido = (
    status: "pendente" | "pago" | "cancelado",
    itens: Array<[string, number, number]>,
    extra = {},
  ) => ({
    id: Math.random().toString(),
    vendaId: "v",
    nome: "Ana; Souza",
    telefone: "14999998888",
    quantidade: itens.reduce((s, i) => s + i[1], 0),
    totalCents: itens.reduce((s, i) => s + i[1] * i[2], 0),
    observacao: "=sem cebola",
    status,
    createdAt: "2026-10-08T22:30:00Z",
    voucherCodigo: null as string | null,
    entregueEm: null as string | null,
    entregaObs: null as string | null,
    itens: itens.map(([nome, quantidade, preco]) => ({
      nome,
      quantidade,
      precoUnitarioCents: preco,
      totalCents: quantidade * preco,
    })),
    ...extra,
  });
  const pedidos = [
    pedido(
      "pago",
      [
        ["Carne", 2, 800],
        ["Queijo", 1, 800],
      ],
      { entregueEm: "2026-10-09T19:40:00Z" },
    ),
    pedido("pendente", [["Queijo", 3, 800]]),
    pedido("cancelado", [["Carne", 10, 800]]),
    pedido("pago", [["Palmito", 1, 1000]]),
  ];

  it("descreve os itens do pedido", () => {
    expect(descreverItens(pedidos[0].itens)).toBe("2 Carne, 1 Queijo");
  });

  it("total por opção na ordem da venda, sem cancelados e com as pagas à parte", () => {
    expect(totaisPorItem(pedidos, ["Queijo", "Carne"])).toEqual([
      { nome: "Queijo", unidades: 4, pagas: 1, entregues: 1, totalCents: 3200 },
      { nome: "Carne", unidades: 2, pagas: 2, entregues: 2, totalCents: 1600 },
      // Opção que saiu da venda vai para o fim.
      {
        nome: "Palmito",
        unidades: 1,
        pagas: 1,
        entregues: 0,
        totalCents: 1000,
      },
    ]);
  });

  it("planilha: uma coluna por opção, total no fim e texto de terceiros neutralizado", () => {
    const csv = pedidosParaCsv(
      {
        titulo: "Pastel",
        temOpcoes: true,
        geraVoucher: false,
        opcoes: [
          { id: "1", nome: "Carne", precoCents: null },
          { id: "2", nome: "Queijo", precoCents: null },
          { id: "3", nome: "Frango", precoCents: null },
        ],
      },
      pedidos,
    );
    const linhas = csv.replace("﻿", "").split("\r\n");
    expect(linhas[0]).toBe(
      "Data;Nome;WhatsApp;Situação;Carne;Queijo;Frango;Palmito;Total;Observação",
    );
    expect(linhas[1]).toContain(";Pago;2;1;0;0;24,00;");
    // Nome com ponto e vírgula vai entre aspas; observação que parece fórmula não vira fórmula.
    expect(linhas[1]).toContain('"Ana; Souza"');
    expect(linhas[1]).toContain("'=sem cebola");
    expect(csv).toContain("Queijo;4;1;32,00");
    // Com voucher: código, quando foi entregue e as colunas de entregues.
    const comVoucher = pedidosParaCsv(
      {
        titulo: "Pastel",
        temOpcoes: true,
        geraVoucher: true,
        opcoes: [{ id: "1", nome: "Carne", precoCents: null }],
      },
      pedidos.map((p, i) => ({
        ...p,
        voucherCodigo: i === 0 ? "K7P-4QX" : null,
      })),
    );
    expect(comVoucher).toContain("Voucher;Entregue em;Obs. da entrega");
    expect(comVoucher).toContain("K7P-4QX;09/10/2026 16:40;");
    expect(comVoucher).toContain("Pedidos entregues;1");
    expect(comVoucher).toContain("Queijo;4;1;1;32,00");
  });
});

describe("filtrarPedidos", () => {
  const base = {
    vendaId: "v",
    quantidade: 1,
    totalCents: 800,
    observacao: null,
    createdAt: "2026-10-08T22:30:00Z",
    itens: [],
    voucherCodigo: null,
    entregueEm: null,
    entregaObs: null,
  };
  const lista = [
    {
      ...base,
      id: "1",
      nome: "José Antônio",
      telefone: "(14) 99999-8888",
      status: "pago" as const,
    },
    {
      ...base,
      id: "2",
      nome: "Maria",
      telefone: "(14) 98888-7777",
      status: "pendente" as const,
    },
  ];
  it("por situação, por nome sem acento e pelo final do WhatsApp", () => {
    expect(
      filtrarPedidos(lista, { status: "pendente", busca: "" }).map((p) => p.id),
    ).toEqual(["2"]);
    expect(
      filtrarPedidos(lista, { status: "todos", busca: "jose antonio" }).map(
        (p) => p.id,
      ),
    ).toEqual(["1"]);
    expect(
      filtrarPedidos(lista, { status: "todos", busca: "7777" }).map(
        (p) => p.id,
      ),
    ).toEqual(["2"]);
  });
});

describe("voucher", () => {
  it("normaliza o código digitado", () => {
    expect(normalizarCodigoVoucher("k7p4qx")).toBe("K7P-4QX");
    expect(normalizarCodigoVoucher(" K7P 4QX ")).toBe("K7P-4QX");
    expect(normalizarCodigoVoucher("K7P-4Q")).toBeNull();
  });
});

describe("planilha em Excel e filtro de entrega", () => {
  const base = {
    vendaId: "v",
    observacao: null,
    createdAt: "2026-10-08T22:30:00Z",
    voucherCodigo: "K7P-4QX",
    entregaObs: null,
  };
  const pedidos = [
    {
      ...base,
      id: "1",
      nome: "Ana",
      telefone: "1",
      quantidade: 2,
      totalCents: 1600,
      status: "pago" as const,
      entregueEm: "2026-10-09T19:40:00Z",
      itens: [
        {
          nome: "Carne",
          quantidade: 2,
          precoUnitarioCents: 800,
          totalCents: 1600,
        },
      ],
    },
    {
      ...base,
      id: "2",
      nome: "Bia",
      telefone: "2",
      quantidade: 1,
      totalCents: 800,
      status: "pendente" as const,
      entregueEm: null,
      itens: [
        {
          nome: "Queijo",
          quantidade: 1,
          precoUnitarioCents: 800,
          totalCents: 800,
        },
      ],
    },
    {
      ...base,
      id: "3",
      nome: "Caio",
      telefone: "3",
      quantidade: 1,
      totalCents: 800,
      status: "cancelado" as const,
      entregueEm: null,
      itens: [
        {
          nome: "Queijo",
          quantidade: 1,
          precoUnitarioCents: 800,
          totalCents: 800,
        },
      ],
    },
  ];

  it("filtra entregues e a entregar (cancelado não está a entregar)", () => {
    expect(
      filtrarPedidos(pedidos, { status: "entregue", busca: "" }).map(
        (p) => p.id,
      ),
    ).toEqual(["1"]);
    expect(
      filtrarPedidos(pedidos, { status: "a_entregar", busca: "" }).map(
        (p) => p.id,
      ),
    ).toEqual(["2"]);
  });

  it("abas Pedidos, Por opção e Resumo, com o total em centavos na coluna de reais", () => {
    const abas = pedidosParaAbas(
      {
        titulo: "Pastel",
        temOpcoes: true,
        geraVoucher: true,
        opcoes: [
          { id: "1", nome: "Carne", precoCents: null },
          { id: "2", nome: "Queijo", precoCents: null },
        ],
      },
      pedidos,
    );
    expect(abas.map((a) => a.nome)).toEqual(["Pedidos", "Por opção", "Resumo"]);
    const [cab, ana] = abas[0].linhas;
    expect(cab.slice(4, 7)).toEqual(["Carne", "Queijo", "Total"]);
    expect(ana.slice(4, 7)).toEqual([2, 0, 1600]);
    expect(abas[0].colunasEmReais).toEqual([6]);
    expect(abas[1].linhas[1]).toEqual(["Carne", 2, 2, 2, 1600]);
    expect(abas[2].linhas).toContainEqual(["Pedidos entregues", 1]);
  });
});

describe("busca única", () => {
  const base = {
    vendaId: "v",
    quantidade: 1,
    totalCents: 800,
    observacao: null,
    createdAt: "2026-10-08T22:30:00Z",
    itens: [],
    entregueEm: null,
    entregaObs: null,
    status: "pago" as const,
  };
  const lista = [
    { ...base, id: "1", nome: "Ana", telefone: "(14) 99999-8888", voucherCodigo: "K7P-4QX" },
    { ...base, id: "2", nome: "Bia", telefone: "(14) 98888-7777", voucherCodigo: "AB2-CD3" },
  ];
  it("acha pelo código do voucher, digitado de qualquer jeito", () => {
    expect(filtrarPedidos(lista, { status: "todos", busca: "k7p4qx" }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrarPedidos(lista, { status: "todos", busca: "AB2-CD3" }).map((p) => p.id)).toEqual(["2"]);
  });
});
