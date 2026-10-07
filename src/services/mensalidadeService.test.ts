import { describe, expect, it, vi } from "vitest";
import { createMensalidadeService, valorEfetivo, type MensalidadeRepository } from "./mensalidadeService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const CONTA = "22222222-2222-4222-8222-222222222222";

function build(over: Partial<MensalidadeRepository> = {}) {
  const repo = {
    listar: vi.fn(async () => []),
    definir: vi.fn(async () => null),
    ...over,
  } as unknown as MensalidadeRepository;
  const biller = { syncBilling: vi.fn(async () => ({ syncPending: false })) };
  const log = { error: vi.fn() };
  return { repo, biller, log, svc: createMensalidadeService({ repo, biller, log }) };
}

describe("valorEfetivo", () => {
  it("o valor próprio vence o padrão; sem ele, vale o padrão", () => {
    expect(valorEfetivo({ valorProprioCents: 500, valorPadraoCents: 8990 })).toBe(500);
    expect(valorEfetivo({ valorProprioCents: null, valorPadraoCents: 8990 })).toBe(8990);
  });
});

describe("mensalidadeService.definir", () => {
  it("grava o valor próprio em centavos, com o motivo", async () => {
    const { svc, repo, biller } = build();
    const r = await svc.definir({ churchId: IGREJA, valor: "R$ 5,00", motivo: "  Igreja de teste " });
    expect(repo.definir).toHaveBeenCalledWith(IGREJA, 500, "Igreja de teste");
    // A igreja ainda não paga: não há cobrança para atualizar.
    expect(biller.syncBilling).not.toHaveBeenCalled();
    expect(r).toEqual({ cobrancaPendente: false });
  });

  it("valor em branco devolve a igreja ao padrão, sem pedir motivo", async () => {
    const { svc, repo } = build();
    await svc.definir({ churchId: IGREJA, valor: "  ", motivo: "" });
    expect(repo.definir).toHaveBeenCalledWith(IGREJA, null, null);
  });

  it("recusa abaixo de R$ 5,00, valor absurdo, texto que não é valor e valor sem motivo", async () => {
    const { svc, repo } = build();
    const ruins = [
      { valor: "4,99", motivo: "Teste" },
      { valor: "0", motivo: "Teste" },
      { valor: "10.000,01", motivo: "Teste" },
      { valor: "barato", motivo: "Teste" },
      { valor: "10,00", motivo: "" },
      { valor: "10,00", motivo: "ab" },
    ];
    for (const ruim of ruins) {
      await expect(svc.definir({ churchId: IGREJA, ...ruim })).rejects.toMatchObject({ code: "validation_error" });
    }
    await expect(svc.definir({ churchId: "x", valor: "10,00", motivo: "Teste" })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repo.definir).not.toHaveBeenCalled();
  });

  it("igreja que já paga tem a cobrança atualizada no provedor", async () => {
    const { svc, biller } = build({ definir: vi.fn(async () => CONTA) });
    const r = await svc.definir({ churchId: IGREJA, valor: "49,90", motivo: "Desconto de parceria" });
    expect(biller.syncBilling).toHaveBeenCalledWith(CONTA, { createIfMissing: false });
    expect(r.cobrancaPendente).toBe(false);
  });

  it("se o provedor falhar, o preço fica gravado e a tela é avisada", async () => {
    const { svc, biller, repo, log } = build({ definir: vi.fn(async () => CONTA) });
    biller.syncBilling.mockRejectedValueOnce(new Error("provedor fora"));
    const r = await svc.definir({ churchId: IGREJA, valor: "49,90", motivo: "Desconto de parceria" });
    expect(repo.definir).toHaveBeenCalled();
    expect(r.cobrancaPendente).toBe(true);
    expect(log.error).toHaveBeenCalled();

    biller.syncBilling.mockResolvedValueOnce({ syncPending: true });
    expect((await svc.definir({ churchId: IGREJA, valor: "49,90", motivo: "Desconto" })).cobrancaPendente).toBe(true);
  });
});
