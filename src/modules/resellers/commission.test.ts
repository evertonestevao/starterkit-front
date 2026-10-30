import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedPaymentEvent } from "@/types/billing";
import { createCommissionService, type CommissionFailure, type CommissionRepository } from "./commissionService";

const baseEvent: NormalizedPaymentEvent = {
  type: "subscription.activated",
  gateway: "asaas",
  externalSubscriptionId: "sub_1",
  externalCustomerId: "cus_1",
  companyId: "company-1",
  planId: "plan-month",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  payment: { externalId: "pay_1", grossAmountCents: 10000 },
};

function makeRepo() {
  const failures = new Map<string, CommissionFailure>();
  const repo = {
    findCompanyIdBySubscription: vi.fn(async () => "company-from-subscription"),
    getPlanInterval: vi.fn(async (planId: string) =>
      planId === "plan-year" ? ("year" as const) : planId === "plan-month" ? ("month" as const) : null,
    ),
    registerCommission: vi.fn(async () => {}),
    reverseCommission: vi.fn(async () => {}),
    endClient: vi.fn(async () => {}),
    recordFailure: vi.fn(async ({ externalId, payload }) => {
      failures.set(externalId, { id: externalId, status: "pending", payload });
    }),
    resolveFailure: vi.fn(async (_gateway: string, _type: string, externalId: string) => {
      const failure = failures.get(externalId);
      if (failure) failure.status = "resolved";
    }),
    getFailure: vi.fn(async (id: string) => failures.get(id) ?? null),
  } satisfies CommissionRepository;
  return repo;
}

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => errorLog.mockRestore();
});

describe("pagamento recebido", () => {
  it("registra com gateway, id do pagamento e valor bruto", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent(baseEvent);
    expect(repo.registerCommission).toHaveBeenCalledWith({
      companyId: "company-1",
      gateway: "asaas",
      externalPaymentId: "pay_1",
      grossAmountCents: 10000,
      monthsCovered: 1,
    });
  });

  it("months_covered vem do ciclo do plano", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({ ...baseEvent, planId: "plan-year" });
    expect(repo.registerCommission).toHaveBeenCalledWith(expect.objectContaining({ monthsCovered: 12 }));
  });

  it("empresa ausente no evento é buscada pela assinatura", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({ ...baseEvent, companyId: null });
    expect(repo.registerCommission).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-from-subscription" }),
    );
  });

  it("evento sem dados de pagamento (Stripe) não gera comissão", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({ ...baseEvent, payment: undefined });
    expect(repo.registerCommission).not.toHaveBeenCalled();
    expect(repo.recordFailure).not.toHaveBeenCalled();
  });
});

describe("estorno e cancelamento", () => {
  it("estorno chama reverse com o total estornado", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({
      ...baseEvent,
      type: "payment.refunded",
      payment: undefined,
      refund: { externalPaymentId: "pay_1", refundedCents: 4000 },
    });
    expect(repo.reverseCommission).toHaveBeenCalledWith("asaas", "pay_1", 4000);
  });

  it("assinatura cancelada encerra o vínculo", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({
      ...baseEvent,
      type: "subscription.canceled",
      companyId: null,
      payment: undefined,
    });
    expect(repo.endClient).toHaveBeenCalledWith("company-from-subscription");
  });

  it("evento ignorado não toca em nada", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({ ...baseEvent, type: "ignored", payment: undefined });
    expect(repo.registerCommission).not.toHaveBeenCalled();
    expect(repo.resolveFailure).not.toHaveBeenCalled();
  });
});

describe("falha de comissão", () => {
  it("não derruba o pagamento e vira pendência", async () => {
    const repo = makeRepo();
    repo.registerCommission.mockRejectedValueOnce(new Error("banco fora"));
    await expect(createCommissionService(repo).processEvent(baseEvent)).resolves.toBeUndefined();
    expect(repo.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: "asaas",
        eventType: "subscription.activated",
        externalId: "pay_1",
        error: "banco fora",
        payload: baseEvent,
      }),
    );
  });

  it("plano desconhecido vira pendência em vez de assumir mensal", async () => {
    const repo = makeRepo();
    await createCommissionService(repo).processEvent({ ...baseEvent, planId: "sumiu" });
    expect(repo.registerCommission).not.toHaveBeenCalled();
    expect(repo.recordFailure).toHaveBeenCalled();
  });

  it("propaga só se nem a pendência puder ser gravada, para o gateway reenviar", async () => {
    const repo = makeRepo();
    repo.registerCommission.mockRejectedValueOnce(new Error("banco fora"));
    repo.recordFailure.mockRejectedValueOnce(new Error("banco fora"));
    await expect(createCommissionService(repo).processEvent(baseEvent)).rejects.toThrow("banco fora");
  });

  it("reprocesso resolve; repetir é inofensivo", async () => {
    const repo = makeRepo();
    const service = createCommissionService(repo);
    repo.registerCommission.mockRejectedValueOnce(new Error("banco fora"));
    await service.processEvent(baseEvent);

    await expect(service.reprocessFailure("pay_1")).resolves.toBe(true);
    await expect(service.reprocessFailure("pay_1")).resolves.toBe(true);
    // 1 falha + 1 reprocesso: o segundo vê "resolvida" e não chama o banco.
    expect(repo.registerCommission).toHaveBeenCalledTimes(2);
  });

  it("reprocesso que falha de novo continua pendente", async () => {
    const repo = makeRepo();
    const service = createCommissionService(repo);
    repo.registerCommission.mockRejectedValue(new Error("banco fora"));
    await service.processEvent(baseEvent);
    await expect(service.reprocessFailure("pay_1")).resolves.toBe(false);
  });

  it("pendência inexistente é erro", async () => {
    await expect(createCommissionService(makeRepo()).reprocessFailure("x")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
