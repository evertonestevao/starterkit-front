import { describe, expect, it, vi } from "vitest";
import type { CreateCheckoutParams } from "@/types/billing";
import { createAsaasGateway, parseExternalReference } from "./asaasGateway";

const TOKEN = "token-do-webhook";

type Route = (url: string, init: RequestInit) => unknown;

/** fetch fake: responde por método + caminho e registra as chamadas. */
function makeFetch(routes: Record<string, Route>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https:\/\/[^/]+\/v3/, "");
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[`${method} ${path}`];
    if (!route) {
      return new Response(JSON.stringify({ errors: [{ description: "rota fake" }] }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(route(url, init ?? {})), { status: 200 });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function makeGateway(routes: Record<string, Route> = {}) {
  const { fetchFn, calls } = makeFetch(routes);
  const gateway = createAsaasGateway({
    apiKey: "$aact_test",
    webhookToken: TOKEN,
    environment: "sandbox",
    fetchFn,
  });
  return { gateway, calls };
}

function webhook(body: unknown, token = TOKEN) {
  return {
    payload: JSON.stringify(body),
    headers: new Headers(token ? { "asaas-access-token": token } : {}),
  };
}

const checkoutParams: CreateCheckoutParams = {
  companyId: "company-1",
  plan: {
    id: "plan-pro",
    code: "pro",
    name: "Pro",
    priceCents: 9900,
    currency: "BRL",
    billingInterval: "month",
    externalPriceId: null,
  },
  customer: { email: "ana@example.com", name: "Ana" },
  successUrl: "https://app.example.com/dashboard/billing?status=success",
  cancelUrl: "https://app.example.com/dashboard/billing?status=canceled",
};

describe("parseExternalReference", () => {
  it("separa empresa e plano", () => {
    expect(parseExternalReference("c1:p1")).toEqual({ companyId: "c1", planId: "p1" });
  });

  it("formato inválido vira null", () => {
    expect(parseExternalReference("só-um-valor")).toBeNull();
    expect(parseExternalReference(null)).toBeNull();
  });
});

describe("createCheckout", () => {
  it("cria link recorrente com o valor do plano e a referência da empresa", async () => {
    const { gateway, calls } = makeGateway({
      "POST /paymentLinks": () => ({ id: "link-1", url: "https://asaas.com/c/link-1" }),
    });

    await expect(gateway.createCheckout(checkoutParams)).resolves.toEqual({
      id: "link-1",
      url: "https://asaas.com/c/link-1",
    });
    expect(calls[0].body).toMatchObject({
      value: 99,
      billingType: "UNDEFINED",
      chargeType: "RECURRENT",
      subscriptionCycle: "MONTHLY",
      externalReference: "company-1:plan-pro",
      callback: { successUrl: checkoutParams.successUrl, autoRedirect: true },
    });
  });

  it("plano anual vira ciclo YEARLY", async () => {
    const { gateway, calls } = makeGateway({
      "POST /paymentLinks": () => ({ id: "l", url: "u" }),
    });
    await gateway.createCheckout({
      ...checkoutParams,
      plan: { ...checkoutParams.plan, billingInterval: "year" },
    });
    expect(calls[0].body).toMatchObject({ subscriptionCycle: "YEARLY" });
  });

  it("erro da API vira payment_error sem vazar o detalhe", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.createCheckout(checkoutParams)).rejects.toMatchObject({
      code: "payment_error",
      message: "Falha na operação de pagamento",
    });
  });
});

describe("handleWebhook", () => {
  it("recusa token ausente ou errado", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.handleWebhook(webhook({}, ""))).rejects.toMatchObject({
      code: "payment_error",
    });
    await expect(gateway.handleWebhook(webhook({}, "outro-token"))).rejects.toMatchObject({
      code: "payment_error",
    });
  });

  it("pagamento confirmado de assinatura ativa o plano com período e empresa", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({
        id: "sub_1",
        customer: "cus_1",
        externalReference: "company-1:plan-pro",
        nextDueDate: "2026-11-26",
      }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_1", customer: "cus_1", subscription: "sub_1", dueDate: "2026-10-26" },
      }),
    );
    expect(event).toEqual({
      type: "subscription.activated",
      gateway: "asaas",
      externalSubscriptionId: "sub_1",
      externalCustomerId: "cus_1",
      companyId: "company-1",
      planId: "plan-pro",
      currentPeriodStart: "2026-10-26T00:00:00.000Z",
      currentPeriodEnd: "2026-11-26T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("sem referência na assinatura, busca no link de pagamento de origem", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({ id: "sub_1", externalReference: null }),
      "GET /paymentLinks/link-1": () => ({ externalReference: "company-9:plan-ent" }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "PAYMENT_RECEIVED",
        payment: { subscription: "sub_1", paymentLink: "link-1", dueDate: "2026-10-26" },
      }),
    );
    expect(event).toMatchObject({ companyId: "company-9", planId: "plan-ent" });
  });

  it("pagamento vencido vira payment.failed", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({ id: "sub_1", externalReference: "c:p" }),
    });
    const event = await gateway.handleWebhook(
      webhook({ event: "PAYMENT_OVERDUE", payment: { subscription: "sub_1" } }),
    );
    expect(event.type).toBe("payment.failed");
  });

  it("assinatura removida vira subscription.canceled sem chamar a API", async () => {
    const { gateway, calls } = makeGateway();
    const event = await gateway.handleWebhook(
      webhook({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1", customer: "cus_1" } }),
    );
    expect(event).toMatchObject({ type: "subscription.canceled", externalSubscriptionId: "sub_1" });
    expect(calls).toHaveLength(0);
  });

  it("pagamento avulso e eventos desconhecidos são ignorados", async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.handleWebhook(webhook({ event: "PAYMENT_CONFIRMED", payment: { id: "avulso" } })),
    ).resolves.toMatchObject({ type: "ignored" });
    await expect(
      gateway.handleWebhook(webhook({ event: "PAYMENT_CREATED", payment: {} })),
    ).resolves.toMatchObject({ type: "ignored" });
  });
});

describe("syncExtraSeats e cancelamento", () => {
  it("atualiza o valor total da assinatura (plano + extras)", async () => {
    const { gateway, calls } = makeGateway({ "PUT /subscriptions/sub_1": () => ({}) });
    await gateway.syncExtraSeats({
      externalSubscriptionId: "sub_1",
      quantity: 2,
      unitPriceCents: 1990,
      basePriceCents: 9900,
      externalPriceId: null,
    });
    expect(calls[0]).toEqual({
      method: "PUT",
      path: "/subscriptions/sub_1",
      body: { value: 138.8, updatePendingPayments: true },
    });
  });

  it("cancela removendo a assinatura no Asaas", async () => {
    const { gateway, calls } = makeGateway({ "DELETE /subscriptions/sub_1": () => ({}) });
    await gateway.cancelSubscription("sub_1");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/subscriptions/sub_1" });
  });

  it("não tem portal do cliente", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.getPortalUrl("cus_1", "https://x")).resolves.toBeNull();
  });
});

/** Estrutura e valores do exemplo de "Eventos para cobranças" na documentação do Asaas. */
function docsPaymentEvent(event: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
    event,
    dateCreated: "2024-06-12 16:45:03",
    account: { id: "acc_1", ownerId: null },
    payment: {
      object: "payment",
      id: "pay_080225913252",
      dateCreated: "2021-01-01",
      customer: "cus_G7Dvo4iphUNk",
      subscription: "sub_VXJBYgP2u0eO",
      paymentLink: null,
      value: 100,
      netValue: 94.51,
      originalValue: null,
      billingType: "CREDIT_CARD",
      status: "RECEIVED",
      dueDate: "2021-01-01",
      externalReference: null,
      deleted: false,
      refunds: null,
      ...overrides,
    },
  };
}

const subscriptionRoute = {
  "GET /subscriptions/sub_VXJBYgP2u0eO": () => ({
    id: "sub_VXJBYgP2u0eO",
    customer: "cus_G7Dvo4iphUNk",
    externalReference: "company-1:plan-pro",
    nextDueDate: "2021-02-01",
  }),
};

describe("eventos de comissão (payloads da documentação)", () => {
  it.each(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])(
    "%s traz id do pagamento e valor BRUTO, não o líquido",
    async (name) => {
      const { gateway } = makeGateway(subscriptionRoute);
      const event = await gateway.handleWebhook(webhook(docsPaymentEvent(name)));
      expect(event.type).toBe("subscription.activated");
      expect(event.payment).toEqual({ externalId: "pay_080225913252", grossAmountCents: 10000 });
      expect(event.companyId).toBe("company-1");
    },
  );

  it("converte centavos sem erro de ponto flutuante", async () => {
    const { gateway } = makeGateway(subscriptionRoute);
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_RECEIVED", { value: 129.9 })));
    expect(event.payment?.grossAmountCents).toBe(12990);
  });

  it("PAYMENT_OVERDUE não gera dados de pagamento", async () => {
    const { gateway } = makeGateway(subscriptionRoute);
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_OVERDUE")));
    expect(event.type).toBe("payment.failed");
    expect(event.payment).toBeUndefined();
  });

  it("PAYMENT_REFUNDED é estorno integral e não consulta a assinatura", async () => {
    const { gateway, calls } = makeGateway();
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_REFUNDED")));
    expect(event.type).toBe("payment.refunded");
    expect(event.refund).toEqual({ externalPaymentId: "pay_080225913252", refundedCents: null });
    expect(calls).toHaveLength(0);
  });

  it("PAYMENT_PARTIALLY_REFUNDED soma só os estornos concluídos", async () => {
    const { gateway } = makeGateway({
      "GET /payments/pay_080225913252/refunds": () => ({
        data: [
          { status: "DONE", value: 40 },
          { status: "DONE", value: 10.5 },
          { status: "PENDING", value: 30 },
          { status: "CANCELLED", value: 5 },
        ],
      }),
    });
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_PARTIALLY_REFUNDED")));
    expect(event.refund).toEqual({ externalPaymentId: "pay_080225913252", refundedCents: 5050 });
  });

  it.each(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"])("%s cancela a assinatura", async (name) => {
    const { gateway } = makeGateway();
    const event = await gateway.handleWebhook(
      webhook({ id: "evt_1", event: name, subscription: { id: "sub_VXJBYgP2u0eO", customer: "cus_1" } }),
    );
    expect(event.type).toBe("subscription.canceled");
    expect(event.externalSubscriptionId).toBe("sub_VXJBYgP2u0eO");
  });

  it("eventos que não tratamos e campos novos são ignorados sem erro", async () => {
    const { gateway } = makeGateway();
    const chargeback = await gateway.handleWebhook(
      webhook({ ...docsPaymentEvent("PAYMENT_CHARGEBACK_REQUESTED"), campoNovo: { x: 1 } }),
    );
    expect(chargeback.type).toBe("ignored");
  });
});
