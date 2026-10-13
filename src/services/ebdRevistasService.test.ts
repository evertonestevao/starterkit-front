import { describe, expect, it, vi } from "vitest";
import { createEbdRevistasService, type EbdRevistasActor, type EbdRevistasRepository } from "./ebdRevistasService";

const TRI = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const REV2 = "33333333-3333-4333-8333-333333333333";
const MEMBRO = "44444444-4444-4444-8444-444444444444";
const PEDIDO = "55555555-5555-4555-8555-555555555555";

const secretaria: EbdRevistasActor = { role: "member", podeGerirEbd: true };
const owner: EbdRevistasActor = { role: "owner", podeGerirEbd: false };
const professor: EbdRevistasActor = { role: "member", podeGerirEbd: false };

function build(over: Partial<EbdRevistasRepository> = {}) {
  const repo: EbdRevistasRepository = {
    doTrimestre: vi.fn(async () => ({ revistas: [], pedidos: [], semPedido: [] })),
    salvarRevista: vi.fn(async () => REV),
    removerRevista: vi.fn(async () => undefined),
    copiarRevistas: vi.fn(async () => 3),
    salvarPedido: vi.fn(async () => PEDIDO),
    registrarPagamento: vi.fn(async () => "pag"),
    estornarPagamento: vi.fn(async () => undefined),
    marcarEntrega: vi.fn(async () => undefined),
    cancelarPedido: vi.fn(async () => undefined),
    ...over,
  };
  return { repo, svc: createEbdRevistasService({ repo }) };
}

const pedido = (over: Record<string, unknown> = {}) => ({
  id: "",
  trimestreId: TRI,
  membroId: MEMBRO,
  nome: "",
  telefone: "",
  observacao: "",
  itens: [{ revistaId: REV, quantidade: "2" }],
  ...over,
});

describe("pedidos de revista da EBD", () => {
  it("só a gestão da EBD entra: o professor não vê nem grava nada", async () => {
    const { svc, repo } = build();
    await expect(svc.doTrimestre(professor, TRI)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.salvarPedido(professor, pedido())).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      svc.registrarPagamento(professor, { pedidoId: PEDIDO, valorCentavos: "10", data: "2026-10-12", forma: "pix" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.marcarEntrega(professor, PEDIDO, true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.cancelarPedido(professor, PEDIDO)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.doTrimestre).not.toHaveBeenCalled();
    expect(repo.salvarPedido).not.toHaveBeenCalled();
    await svc.doTrimestre(secretaria, TRI);
    await svc.doTrimestre(owner, TRI);
    expect(repo.doTrimestre).toHaveBeenCalledTimes(2);
  });

  it("trimestre que o banco não devolve (ou id torto) é 'não encontrado'", async () => {
    const { svc } = build({ doTrimestre: vi.fn(async () => null) });
    await expect(svc.doTrimestre(secretaria, TRI)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.doTrimestre(secretaria, "x' or 1=1")).rejects.toMatchObject({ code: "not_found" });
  });

  it("revista: preço em reais vira centavos; título e preço são conferidos", async () => {
    const { svc, repo } = build();
    await svc.salvarRevista(secretaria, {
      id: "",
      trimestreId: TRI,
      titulo: " Adultos - aluno ",
      precoCentavos: "12,50",
      classeId: "",
    });
    expect(repo.salvarRevista).toHaveBeenLastCalledWith({
      id: null,
      trimestreId: TRI,
      titulo: "Adultos - aluno",
      precoCentavos: 1250,
      classeId: null,
    });
    await svc.salvarRevista(secretaria, {
      id: REV,
      trimestreId: TRI,
      titulo: "Jovens",
      precoCentavos: "R$ 1.234,5",
      classeId: "",
    });
    expect(repo.salvarRevista).toHaveBeenLastCalledWith(expect.objectContaining({ id: REV, precoCentavos: 123450 }));
    await svc.salvarRevista(secretaria, {
      id: "",
      trimestreId: TRI,
      titulo: "Brinde",
      precoCentavos: "0",
      classeId: "",
    });
    expect(repo.salvarRevista).toHaveBeenLastCalledWith(expect.objectContaining({ precoCentavos: 0 }));
    for (const ruim of [{ titulo: "A" }, { precoCentavos: "doze" }, { precoCentavos: "-5" }, { precoCentavos: "" }]) {
      await expect(
        svc.salvarRevista(secretaria, {
          id: "",
          trimestreId: TRI,
          titulo: "Jovens",
          precoCentavos: "10",
          classeId: "",
          ...ruim,
        }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
  });

  it("pedido: pessoa do cadastro ou nome de fora, com pelo menos uma revista e sem repetir", async () => {
    const { svc, repo } = build();
    await svc.salvarPedido(secretaria, pedido({ observacao: " paga domingo " }));
    expect(repo.salvarPedido).toHaveBeenLastCalledWith({
      id: null,
      trimestreId: TRI,
      membroId: MEMBRO,
      nome: null,
      telefone: null,
      observacao: "paga domingo",
      itens: [{ revistaId: REV, quantidade: 2 }],
    });
    await svc.salvarPedido(secretaria, pedido({ membroId: "", nome: "Pessoa De Fora", telefone: "(14) 99655-6043" }));
    expect(repo.salvarPedido).toHaveBeenLastCalledWith(
      expect.objectContaining({ membroId: null, nome: "Pessoa De Fora", telefone: "14996556043" }),
    );
    const chamadas = (repo.salvarPedido as ReturnType<typeof vi.fn>).mock.calls.length;
    for (const ruim of [
      { membroId: "", nome: "" },
      { itens: [] },
      { itens: [{ revistaId: REV, quantidade: 0 }] },
      {
        itens: [
          { revistaId: REV, quantidade: 1 },
          { revistaId: REV, quantidade: 2 },
        ],
      },
      { membroId: "", nome: "Fulano", telefone: "9965" },
    ]) {
      await expect(svc.salvarPedido(secretaria, pedido(ruim))).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(repo.salvarPedido).toHaveBeenCalledTimes(chamadas);
    // Mais de uma revista no mesmo pedido.
    await svc.salvarPedido(
      secretaria,
      pedido({
        itens: [
          { revistaId: REV, quantidade: 1 },
          { revistaId: REV2, quantidade: 3 },
        ],
      }),
    );
    expect(repo.salvarPedido).toHaveBeenLastCalledWith(
      expect.objectContaining({
        itens: [
          { revistaId: REV, quantidade: 1 },
          { revistaId: REV2, quantidade: 3 },
        ],
      }),
    );
  });

  it("pagamento: valor em reais, data e forma conferidos", async () => {
    const { svc, repo } = build();
    await svc.registrarPagamento(secretaria, {
      pedidoId: PEDIDO,
      valorCentavos: "10",
      data: "2026-10-12",
      forma: "pix",
    });
    expect(repo.registrarPagamento).toHaveBeenCalledWith({
      pedidoId: PEDIDO,
      valorCentavos: 1000,
      data: "2026-10-12",
      forma: "pix",
    });
    for (const ruim of [
      { valorCentavos: "0" },
      { valorCentavos: "abc" },
      { data: "12/10/2026" },
      { forma: "cheque" },
    ]) {
      await expect(
        svc.registrarPagamento(secretaria, {
          pedidoId: PEDIDO,
          valorCentavos: "10",
          data: "2026-10-12",
          forma: "pix",
          ...ruim,
        }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(repo.registrarPagamento).toHaveBeenCalledTimes(1);
  });

  it("copiar revistas exige outro trimestre; ids tortos não chegam ao banco", async () => {
    const { svc, repo } = build();
    await expect(svc.copiarRevistas(secretaria, TRI, TRI)).rejects.toMatchObject({ code: "validation_error" });
    await expect(svc.cancelarPedido(secretaria, "abc")).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.estornarPagamento(secretaria, "abc")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.copiarRevistas).not.toHaveBeenCalled();
    expect(repo.cancelarPedido).not.toHaveBeenCalled();
    expect(await svc.copiarRevistas(secretaria, REV, TRI)).toBe(3);
  });
});
