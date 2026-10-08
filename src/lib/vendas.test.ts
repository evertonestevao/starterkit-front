import { describe, expect, it } from "vitest";
import { maximoParaPedir, mensagemDoComprovante, resumirPedidos, situacaoDaVenda, unidadesReservadas } from "./vendas";

const base = { status: "ativa" as const, pixConfirmadoEm: "2026-10-01T10:00:00Z", encerraEm: null, estoque: null };

describe("situacaoDaVenda", () => {
  it("sem a chave confirmada, não está aberta", () => {
    expect(situacaoDaVenda({ ...base, pixConfirmadoEm: null }, 0, "2026-10-08")).toBe("aguardando_pix");
  });

  it("aceita pedidos até o fim do dia de encerramento", () => {
    expect(situacaoDaVenda({ ...base, encerraEm: "2026-10-08" }, 0, "2026-10-08")).toBe("aberta");
    expect(situacaoDaVenda({ ...base, encerraEm: "2026-10-08" }, 0, "2026-10-09")).toBe("encerrada");
  });

  it("esgota quando as unidades reservadas chegam ao estoque", () => {
    expect(situacaoDaVenda({ ...base, estoque: 10 }, 9, "2026-10-08")).toBe("aberta");
    expect(situacaoDaVenda({ ...base, estoque: 10 }, 10, "2026-10-08")).toBe("esgotada");
  });

  it("encerrada à mão vence o resto", () => {
    expect(situacaoDaVenda({ ...base, status: "encerrada", pixConfirmadoEm: null }, 0, "2026-10-08")).toBe("encerrada");
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
    expect(resumirPedidos(pedidos)).toEqual({ pedidos: 2, unidades: 3, pagoCents: 11000, pendenteCents: 5500 });
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
    const msg = mensagemDoComprovante({ titulo: "Pastel", nome: "Bia", quantidade: 1, totalFormatado: "R$ 8,00", observacao: null });
    expect(msg).not.toContain("Observação");
  });
});
