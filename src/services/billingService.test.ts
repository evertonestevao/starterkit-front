import { describe, expect, it } from "vitest";
import type { ExtraSeatsUpdate, NormalizedPaymentEvent } from "@/types/billing";
import type { Plan, Subscription } from "@/types/database";
import {
  createBillingService,
  DEFAULT_PLAN_CODE,
  type BillingRepository,
} from "./billingService";

function makePlan(overrides: Partial<Plan>): Plan {
  return {
    id: "plan-1",
    code: "pro",
    name: "Pro",
    price_cents: 9900,
    currency: "BRL",
    billing_interval: "month",
    features: {},
    extra_seat_price_cents: 0,
    is_active: true,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: "sub-1",
    company_id: "company-1",
    plan_id: "plan-1",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    external_subscription_id: "ext-1",
    external_customer_id: "cus-1",
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/** Repositório em memória para testar as regras sem Supabase. */
function makeRepo(state: {
  plans: Plan[];
  subscriptions: Subscription[];
  members?: number;
  pendingInvites?: number;
}): BillingRepository {
  return {
    async countActiveMembers() {
      return state.members ?? 0;
    },
    async countPendingInvites() {
      return state.pendingInvites ?? 0;
    },
    async getPlanById(id) {
      return state.plans.find((p) => p.id === id) ?? null;
    },
    async getPlanByCode(code) {
      return state.plans.find((p) => p.code === code) ?? null;
    },
    async getActiveSubscription(companyId) {
      return (
        state.subscriptions.find((s) => s.company_id === companyId && !s.deleted_at) ?? null
      );
    },
    async findSubscriptionByExternalId(externalId) {
      return (
        state.subscriptions.find(
          (s) => s.external_subscription_id === externalId && !s.deleted_at,
        ) ?? null
      );
    },
    async insertSubscription(data) {
      const row = makeSubscription({ ...data, id: `sub-${state.subscriptions.length + 1}` });
      state.subscriptions.push(row);
      return row;
    },
    async updateSubscription(id, data) {
      const row = state.subscriptions.find((s) => s.id === id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return row;
    },
  };
}

describe("canAccessFeature", () => {
  const proPlan = makePlan({
    id: "plan-pro",
    code: "pro",
    features: { api_access: true, max_members: 10, reports: false },
  });
  const freePlan = makePlan({
    id: "plan-free",
    code: DEFAULT_PLAN_CODE,
    features: { max_members: 2 },
  });

  it("libera feature booleana true do plano da assinatura ativa", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(true);
  });

  it("nega feature booleana false e feature ausente", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "reports")).toBe(false);
    expect(await service.canAccessFeature("company-1", "sso")).toBe(false);
  });

  it("trata limite numérico como acessível quando > 0", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "max_members")).toBe(true);
    expect(await service.getFeatureLimit("company-1", "max_members")).toBe(10);
  });

  it("cai para o plano free quando não há assinatura", async () => {
    const service = createBillingService(
      makeRepo({ plans: [proPlan, freePlan], subscriptions: [] }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(false);
    expect(await service.getFeatureLimit("company-1", "max_members")).toBe(2);
  });

  it("cai para o plano free quando a assinatura está cancelada", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro", status: "canceled" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(false);
  });

  it("mantém acesso em past_due (carência de cobrança)", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro", status: "past_due" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(true);
  });
});

describe("getSeatUsage / syncSeatsWithGateway (billing por seat)", () => {
  const threeSeatPlan = makePlan({
    id: "plan-3seats",
    code: "pro",
    features: { max_members: 3 },
    extra_seat_price_cents: 1990,
  });

  function makeGatewaySpy() {
    const calls: ExtraSeatsUpdate[] = [];
    return {
      calls,
      gateway: {
        name: "spy",
        async createCheckout() {
          throw new Error("não usado");
        },
        async cancelSubscription() {},
        async getPortalUrl() {
          return null;
        },
        async handleWebhook() {
          throw new Error("não usado");
        },
        async syncExtraSeats(params: (typeof calls)[number]) {
          calls.push(params);
        },
      },
    };
  }

  it("cenário do spec: plano de 3 seats, 4º membro chegando = 1 seat extra, sem bloqueio", async () => {
    // 3 membros ativos + 1 convite pendente (o 4º a caminho) = 4 seats usados
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [makeSubscription({ plan_id: "plan-3seats" })],
        members: 3,
        pendingInvites: 1,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage).toEqual({
      included: 3,
      used: 4,
      extraSeats: 1,
      extraCostCents: 1990,
    });
  });

  it("dentro do limite: zero extras e custo zero", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [makeSubscription({ plan_id: "plan-3seats" })],
        members: 2,
        pendingInvites: 1,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage.extraSeats).toBe(0);
    expect(usage.extraCostCents).toBe(0);
  });

  it("plano sem max_members numérico = ilimitado, nunca gera extra", async () => {
    const unlimited = makePlan({ id: "plan-unl", code: "enterprise", features: {} });
    const service = createBillingService(
      makeRepo({
        plans: [unlimited],
        subscriptions: [makeSubscription({ plan_id: "plan-unl" })],
        members: 50,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage.included).toBeNull();
    expect(usage.extraSeats).toBe(0);
  });

  it("sincroniza a quantidade de extras no gateway quando há assinatura ativa", async () => {
    const { gateway, calls } = makeGatewaySpy();
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [
          makeSubscription({ plan_id: "plan-3seats", external_subscription_id: "ext-sub" }),
        ],
        members: 5,
      }),
    );
    const usage = await service.syncSeatsWithGateway("company-1", gateway, "price_seat");
    expect(usage.extraSeats).toBe(2);
    expect(calls).toEqual([
      {
        externalSubscriptionId: "ext-sub",
        quantity: 2,
        unitPriceCents: 1990,
        basePriceCents: threeSeatPlan.price_cents,
        externalPriceId: "price_seat",
      },
    ]);
  });

  it("não chama o gateway sem assinatura ativa (plano free) nem com assinatura cancelada", async () => {
    const { gateway, calls } = makeGatewaySpy();
    const freeState = { plans: [threeSeatPlan], subscriptions: [] as Subscription[], members: 5 };
    await createBillingService(makeRepo(freeState)).syncSeatsWithGateway(
      "company-1",
      gateway,
      "price_seat",
    );

    const canceledState = {
      plans: [threeSeatPlan],
      subscriptions: [makeSubscription({ plan_id: "plan-3seats", status: "canceled" as const })],
      members: 5,
    };
    await createBillingService(makeRepo(canceledState)).syncSeatsWithGateway(
      "company-1",
      gateway,
      "price_seat",
    );

    expect(calls).toHaveLength(0);
  });
});

describe("applyPaymentEvent", () => {
  function makeEvent(overrides: Partial<NormalizedPaymentEvent>): NormalizedPaymentEvent {
    return {
      type: "subscription.activated",
      gateway: "fake",
      externalSubscriptionId: "ext-new",
      externalCustomerId: "cus-new",
      companyId: "company-1",
      planId: "plan-pro",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      ...overrides,
    };
  }

  it("cria assinatura em subscription.activated quando não existe", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(makeEvent({}));
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      company_id: "company-1",
      plan_id: "plan-pro",
      status: "active",
      external_subscription_id: "ext-new",
    });
  });

  it("é idempotente: evento repetido não duplica assinatura", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(makeEvent({}));
    await service.applyPaymentEvent(makeEvent({}));
    expect(state.subscriptions).toHaveLength(1);
  });

  it("marca canceled em subscription.canceled", async () => {
    const state = {
      plans: [] as Plan[],
      subscriptions: [makeSubscription({ external_subscription_id: "ext-1" })],
    };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(
      makeEvent({ type: "subscription.canceled", externalSubscriptionId: "ext-1" }),
    );
    expect(state.subscriptions[0].status).toBe("canceled");
  });

  it("marca past_due em payment.failed", async () => {
    const state = {
      plans: [] as Plan[],
      subscriptions: [makeSubscription({ external_subscription_id: "ext-1" })],
    };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(
      makeEvent({ type: "payment.failed", externalSubscriptionId: "ext-1" }),
    );
    expect(state.subscriptions[0].status).toBe("past_due");
  });

  it("rejeita ativação sem company_id/plan_id e ignora eventos 'ignored'", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    await expect(service.applyPaymentEvent(makeEvent({ companyId: null }))).rejects.toThrow();
    await service.applyPaymentEvent(makeEvent({ type: "ignored" }));
    expect(state.subscriptions).toHaveLength(0);
  });
});
