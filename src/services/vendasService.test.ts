import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { Venda } from "@/types/vendas";
import {
  canVendas,
  createConfirmacaoVendaService,
  createVendasPublicasService,
  createVendasService,
  type VendasActor,
  type VendasRepository,
} from "./vendasService";

const IGREJA = { id: "11111111-1111-4111-8111-111111111111", name: "Igreja Betel" };
const VENDA_ID = "22222222-2222-4222-8222-222222222222";

const ADMIN: VendasActor = {
  companyId: "33333333-3333-4333-8333-333333333333",
  role: "admin",
  liberado: false,
  userId: "44444444-4444-4444-8444-444444444444",
  email: "lider@igreja.org",
};

const venda: Venda = {
  id: VENDA_ID,
  titulo: "Camiseta do congresso",
  descricao: null,
  precoCents: 5500,
  pixChave: "tesouraria@igreja.org",
  pixTitular: "Maria Souza",
  whatsappComprovante: null,
  pixConfirmadoEm: null,
  encerraEm: null,
  estoque: null,
  maxPorPedido: null,
  status: "ativa",
  createdAt: "2026-10-01T10:00:00Z",
};

const entrada = {
  titulo: "Camiseta do congresso",
  descricao: "Tamanhos P, M, G e GG",
  precoCents: 5500,
  pixChave: "tesouraria@igreja.org",
  pixTitular: "Maria Souza",
  whatsappComprovante: "(14) 99999-8888",
  encerraEm: "2026-10-20",
  estoque: 80,
  maxPorPedido: 10,
};

function build(precisaConfirmar = true) {
  const repo: VendasRepository = {
    getChurch: vi.fn(async () => IGREJA),
    listar: vi.fn(async () => [venda]),
    buscar: vi.fn(async (_c: string, id: string) => (id === VENDA_ID ? venda : null)),
    salvar: vi.fn(async () => ({ id: VENDA_ID, precisaConfirmar })),
    definirStatus: vi.fn(async () => undefined),
    excluir: vi.fn(async () => undefined),
    pedidos: vi.fn(async () => []),
    marcarPedido: vi.fn(async () => undefined),
    criarConfirmacao: vi.fn(async () => ["responsavel@igreja.org"]),
  };
  const notifier = { sendVendaPixConfirmation: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const service = createVendasService({
    repo,
    hoje: () => "2026-10-08",
    notifier,
    audit,
    tokens: { make: () => "token", hash: () => "hash" },
    log: { error: vi.fn() },
  });
  return { repo, notifier, audit, service };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("canVendas", () => {
  it("quem administra ou tem o módulo pelo cargo", () => {
    expect(canVendas("owner", false)).toBe(true);
    expect(canVendas("admin", false)).toBe(true);
    expect(canVendas("member", true)).toBe(true);
    expect(canVendas("member", false)).toBe(false);
  });
});

describe("salvar", () => {
  it("venda nova: grava, registra e manda a chave para o Responsável confirmar", async () => {
    const { repo, notifier, audit, service } = build();

    const r = await service.salvar(ADMIN, null, entrada);

    // O WhatsApp é gravado só com dígitos e vai junto no e-mail de confirmação.
    expect(repo.salvar).toHaveBeenCalledWith(
      IGREJA.id,
      null,
      expect.objectContaining({ precoCents: 5500, estoque: 80, whatsappComprovante: "14999998888" }),
    );
    expect(r).toEqual({ id: VENDA_ID, precisaConfirmar: true, confirmacaoEnviada: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "venda.criada" }));
    // O e-mail leva a chave mascarada, nunca inteira.
    expect(notifier.sendVendaPixConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["responsavel@igreja.org"],
        chaveMascarada: "tes***org",
        titulo: entrada.titulo,
        whatsapp: "14999998888",
      }),
    );
  });

  it("sem WhatsApp do comprovante, grava nulo", async () => {
    const { repo, service } = build();
    await service.salvar(ADMIN, null, { ...entrada, whatsappComprovante: null });
    expect(repo.salvar).toHaveBeenCalledWith(IGREJA.id, null, expect.objectContaining({ whatsappComprovante: null }));
  });

  it("edição sem trocar a chave: não pede confirmação de novo", async () => {
    const { notifier, service } = build(false);
    const r = await service.salvar(ADMIN, VENDA_ID, entrada);
    expect(r.precisaConfirmar).toBe(false);
    expect(notifier.sendVendaPixConfirmation).not.toHaveBeenCalled();
  });

  it("recusa chave Pix em formato inválido, máximo maior que o estoque e data passada", async () => {
    const { repo, service } = build();
    for (const errado of [
      { ...entrada, pixChave: "não é chave" },
      { ...entrada, estoque: 5, maxPorPedido: 10 },
      { ...entrada, encerraEm: "2026-10-07" },
      { ...entrada, precoCents: 0 },
      { ...entrada, whatsappComprovante: "9999-8888" },
    ]) {
      const err = await erroDe(service.salvar(ADMIN, null, errado));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("sem o módulo não entra, e venda de outra igreja não é encontrada", async () => {
    const { repo, service } = build();
    const semAcesso = await erroDe(service.salvar({ ...ADMIN, role: "member" }, null, entrada));
    expect(isAppError(semAcesso) && semAcesso.code).toBe("forbidden");

    const outra = await erroDe(service.salvar(ADMIN, "55555555-5555-4555-8555-555555555555", entrada));
    expect(isAppError(outra) && outra.code).toBe("not_found");
    expect(repo.salvar).not.toHaveBeenCalled();
  });
});

describe("demais ações", () => {
  it("reenviar só enquanto a chave espera confirmação", async () => {
    const { repo, service } = build();
    await service.reenviarConfirmacao(ADMIN, VENDA_ID);
    expect(repo.criarConfirmacao).toHaveBeenCalledOnce();

    vi.mocked(repo.buscar).mockResolvedValueOnce({ ...venda, pixConfirmadoEm: "2026-10-02T10:00:00Z" });
    const err = await erroDe(service.reenviarConfirmacao(ADMIN, VENDA_ID));
    expect(isAppError(err) && err.code).toBe("validation_error");
  });

  it("marcar pedido aceita só as situações conhecidas", async () => {
    const { repo, service } = build();
    await service.marcarPedido(ADMIN, VENDA_ID, "pago");
    expect(repo.marcarPedido).toHaveBeenCalledWith(VENDA_ID, "pago");
    const err = await erroDe(service.marcarPedido(ADMIN, VENDA_ID, "estornado"));
    expect(isAppError(err) && err.code).toBe("validation_error");
  });
});

describe("página pública", () => {
  it("gera o Pix com o total do pedido", async () => {
    const criarPedido = vi.fn(async () => ({
      pedidoId: "66666666-6666-4666-8666-666666666666",
      totalCents: 15000,
      pixChave: "tesouraria@igreja.org",
      pixTitular: "Maria Souza",
      churchName: "Igreja Betel",
      churchAddress: "Rua A, 10 - Centro, Lins/SP",
      whatsappComprovante: "14999998888",
    }));
    const service = createVendasPublicasService({ repo: { listar: vi.fn(), criarPedido }, qr: async () => "data:qr" });

    const r = await service.pedir({
      vendaId: VENDA_ID,
      nome: " Ana ",
      telefone: "(14) 99999-8888",
      quantidade: 3,
      observacao: "2 G e 1 M",
    });

    expect(criarPedido).toHaveBeenCalledWith(expect.objectContaining({ nome: "Ana", quantidade: 3, observacao: "2 G e 1 M" }));
    expect(r.totalCents).toBe(15000);
    expect(r.whatsappComprovante).toBe("14999998888");
    // O valor vai dentro do "copia e cola" (campo 54 do padrão Pix).
    expect(r.pixCopiaECola).toContain("5406150.00");
  });

  it("recusa quantidade zero e telefone vazio sem chegar ao banco", async () => {
    const criarPedido = vi.fn();
    const service = createVendasPublicasService({ repo: { listar: vi.fn(), criarPedido }, qr: async () => "" });
    for (const errado of [{ quantidade: 0, telefone: "14999998888" }, { quantidade: 1, telefone: "" }]) {
      const err = await erroDe(service.pedir({ vendaId: VENDA_ID, nome: "Ana", observacao: null, ...errado }));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(criarPedido).not.toHaveBeenCalled();
  });
});

describe("link de confirmação", () => {
  it("token malformado não chega ao banco", async () => {
    const repo = { consultar: vi.fn(), confirmar: vi.fn() };
    const service = createConfirmacaoVendaService(repo);
    expect(await service.consultar("curto")).toBeNull();
    const err = await erroDe(service.confirmar("../../etc"));
    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.consultar).not.toHaveBeenCalled();
    expect(repo.confirmar).not.toHaveBeenCalled();
  });
});
