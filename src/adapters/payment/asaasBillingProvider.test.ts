import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  centsToReais,
  createAsaasBillingProvider,
  mapAsaasPaymentStatus,
  reaisToCents,
} from "./asaasBillingProvider";

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | undefined;
}

function makeFetch(routes: Array<{ match: string; method?: string; status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const method = init?.method ?? "GET";
    calls.push({
      url: href,
      method,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes.find((r) => href.includes(r.match) && (!r.method || r.method === method));
    if (!route) throw new Error(`rota não programada: ${method} ${href}`);
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const base = { apiKey: "chave_secreta", baseUrl: "https://asaas.test/v3", webhookToken: "token-do-webhook-123" };

describe("conversões", () => {
  it("centavos <-> reais sem erro de ponto flutuante", () => {
    expect(centsToReais(10470)).toBe(104.7);
    expect(reaisToCents(104.7)).toBe(10470);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
  });

  it("mapeia status do Asaas", () => {
    expect(mapAsaasPaymentStatus("CONFIRMED", "PAYMENT_CONFIRMED")).toBe("paid");
    expect(mapAsaasPaymentStatus("RECEIVED", "PAYMENT_RECEIVED")).toBe("paid");
    expect(mapAsaasPaymentStatus("OVERDUE", "PAYMENT_OVERDUE")).toBe("overdue");
    expect(mapAsaasPaymentStatus("REFUNDED", "PAYMENT_REFUNDED")).toBe("refunded");
    expect(mapAsaasPaymentStatus("PENDING", "PAYMENT_DELETED")).toBe("canceled");
    expect(mapAsaasPaymentStatus("ALGO_NOVO", "PAYMENT_UPDATED")).toBe("pending");
  });
});

describe("createAsaasBillingProvider", () => {
  it("cria assinatura mensal no cartão com valor em reais e devolve o link da 1ª fatura", async () => {
    const { fetchFn, calls } = makeFetch([
      { match: "/subscriptions/sub_1/payments", status: 200, body: { data: [{ invoiceUrl: "https://fatura/1" }] } },
      { match: "/subscriptions", method: "POST", status: 200, body: { id: "sub_1" } },
    ]);
    const provider = createAsaasBillingProvider({ ...base, fetchFn });

    const created = await provider.createSubscription({
      customerId: "cus_1",
      amountCents: 7480,
      nextDueDate: "2026-09-17",
      description: "Patrocínio",
      externalReference: "acc-1",
    });

    expect(created).toEqual({ subscriptionId: "sub_1", firstInvoiceUrl: "https://fatura/1" });
    expect(calls[0].body).toMatchObject({
      customer: "cus_1",
      billingType: "CREDIT_CARD",
      cycle: "MONTHLY",
      value: 74.8,
      nextDueDate: "2026-09-17",
    });
    // Sem dados de cartão no nosso servidor, nunca.
    expect(calls[0].body).not.toHaveProperty("creditCard");
    expect(calls[0].headers.get("access_token")).toBe("chave_secreta");
  });

  it("atualiza valor aplicando também à cobrança já gerada", async () => {
    const { fetchFn, calls } = makeFetch([
      { match: "/subscriptions/sub_1", method: "PUT", status: 200, body: { id: "sub_1" } },
    ]);
    await createAsaasBillingProvider({ ...base, fetchFn }).updateSubscriptionAmount("sub_1", 7480);
    expect(calls[0].body).toEqual({ value: 74.8, updatePendingPayments: true });
  });

  it("cancelar assinatura inexistente não é erro", async () => {
    const { fetchFn } = makeFetch([
      { match: "/subscriptions/sub_x", method: "DELETE", status: 404, body: {} },
    ]);
    await expect(
      createAsaasBillingProvider({ ...base, fetchFn }).cancelSubscription("sub_x"),
    ).resolves.toBeUndefined();
  });

  it("erro do provedor não vaza detalhe nem chave na mensagem", async () => {
    const { fetchFn } = makeFetch([
      {
        match: "/customers",
        status: 400,
        body: { errors: [{ code: "invalid_cpfCnpj", description: "detalhe interno do asaas" }] },
      },
    ]);
    await expect(
      createAsaasBillingProvider({ ...base, fetchFn }).createCustomer({
        name: "Maria",
        email: "m@x.com",
        document: "52998224725",
        phone: null,
        externalReference: "acc-1",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      if (!isAppError(err)) return false;
      expect(err.code).toBe("payment_error");
      expect(err.message).not.toContain("detalhe interno");
      expect(err.message).not.toContain("chave_secreta");
      return true;
    });
  });
});

describe("parseWebhook", () => {
  const payload = JSON.stringify({
    event: "PAYMENT_CONFIRMED",
    payment: {
      id: "pay_1",
      subscription: "sub_1",
      value: 104.7,
      dueDate: "2026-10-17",
      status: "CONFIRMED",
      invoiceUrl: "https://fatura/2",
      confirmedDate: "2026-10-17",
    },
  });

  const headersWith = (token?: string) =>
    new Headers(token ? { "asaas-access-token": token } : {});

  it("traduz cobrança de assinatura para o formato neutro", async () => {
    const event = await createAsaasBillingProvider(base).parseWebhook({
      rawBody: payload,
      headers: headersWith(base.webhookToken),
    });
    expect(event).toEqual({
      kind: "charge",
      provider: "asaas",
      charge: {
        paymentId: "pay_1",
        subscriptionId: "sub_1",
        amountCents: 10470,
        dueDate: "2026-10-17",
        status: "paid",
        paidAt: "2026-10-17T12:00:00.000Z",
        invoiceUrl: "https://fatura/2",
      },
    });
  });

  it("recusa token errado, ausente ou webhook sem token configurado", async () => {
    const provider = createAsaasBillingProvider(base);
    for (const token of [undefined, "token-errado-000000000"]) {
      await expect(
        provider.parseWebhook({ rawBody: payload, headers: headersWith(token) }),
      ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "unauthorized");
    }
    await expect(
      createAsaasBillingProvider({ apiKey: "x" }).parseWebhook({
        rawBody: payload,
        headers: headersWith(base.webhookToken),
      }),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "unauthorized");
  });

  it("ignora eventos que não são de cobrança de assinatura", async () => {
    const provider = createAsaasBillingProvider(base);
    const headers = headersWith(base.webhookToken);
    expect(
      await provider.parseWebhook({ rawBody: JSON.stringify({ event: "TRANSFER_DONE" }), headers }),
    ).toEqual({ kind: "ignored", provider: "asaas" });
    expect(
      await provider.parseWebhook({
        rawBody: JSON.stringify({
          event: "PAYMENT_CREATED",
          payment: { id: "avulsa", value: 10, dueDate: "2026-10-01", status: "PENDING" },
        }),
        headers,
      }),
    ).toEqual({ kind: "ignored", provider: "asaas" });
  });
});
