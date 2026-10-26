import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  ExtraSeatsUpdate,
  NormalizedPaymentEvent,
  PaymentEventType,
  WebhookRequest,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/**
 * Adapter Asaas via API REST v3 (fetch + JSON), sem SDK.
 *
 * Fluxo:
 *  - Checkout: cria um Link de Pagamento RECORRENTE com o valor do plano. A
 *    página do Asaas coleta nome, CPF/CNPJ e a forma de pagamento (PIX, boleto
 *    ou cartão) e cria cliente + assinatura. `externalReference` leva
 *    "<companyId>:<planId>" para o webhook achar a empresa.
 *  - Webhook: autenticado pelo header `asaas-access-token` (token definido
 *    ao cadastrar o webhook no painel). Pagamento confirmado de uma
 *    assinatura ativa ou renova o plano; vencido vira past_due.
 *  - Seats extras: Asaas cobra por valor, então o adapter atualiza o valor
 *    total da assinatura (plano + extras × preço unitário).
 *  - Portal: o Asaas não tem portal de autogestão — getPortalUrl devolve null.
 */

const API_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

interface AsaasGatewayConfig {
  apiKey: string;
  webhookToken: string;
  environment: keyof typeof API_URLS;
  /** Injetável nos testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

/** Centavos -> reais com 2 casas (a API do Asaas recebe valores decimais). */
function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Comparação em tempo constante (token do webhook). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** externalReference no formato "<companyId>:<planId>". */
export function parseExternalReference(
  value: string | null | undefined,
): { companyId: string; planId: string } | null {
  if (!value) return null;
  const [companyId, planId] = value.split(":");
  return companyId && planId ? { companyId, planId } : null;
}

const ASAAS_EVENT_MAP: Record<string, PaymentEventType> = {
  PAYMENT_CONFIRMED: "subscription.activated",
  PAYMENT_RECEIVED: "subscription.activated",
  PAYMENT_OVERDUE: "payment.failed",
  SUBSCRIPTION_DELETED: "subscription.canceled",
  SUBSCRIPTION_INACTIVATED: "subscription.canceled",
};

interface AsaasWebhookEvent {
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string | null;
    paymentLink?: string | null;
    externalReference?: string | null;
    dueDate?: string;
  };
  subscription?: {
    id?: string;
    customer?: string;
    externalReference?: string | null;
    nextDueDate?: string;
  };
}

interface AsaasSubscription {
  id: string;
  customer?: string;
  externalReference?: string | null;
  nextDueDate?: string;
}

/** "2026-10-26" -> ISO em UTC; null se ausente. */
function dateToIso(date: string | undefined | null): string | null {
  return date ? new Date(`${date}T00:00:00Z`).toISOString() : null;
}

export function createAsaasGateway(config: AsaasGatewayConfig): PaymentGateway {
  const baseUrl = API_URLS[config.environment];
  const fetchFn = config.fetchFn ?? fetch;

  async function asaasRequest<T = Record<string, unknown>>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: {
        access_token: config.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "starterkit-saas",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) {
      // Detalhe do provedor vai só para o log de servidor via `internal`.
      throw new AppError("payment_error", "Falha na operação de pagamento", json);
    }
    return json;
  }

  /**
   * Empresa e plano de um evento: externalReference da assinatura e, como
   * fallback, do link de pagamento que a originou.
   */
  async function resolveReference(
    subscription: AsaasSubscription | null,
    paymentLinkId: string | null | undefined,
  ) {
    const fromSubscription = parseExternalReference(subscription?.externalReference);
    if (fromSubscription) return fromSubscription;
    if (!paymentLinkId) return null;
    const link = await asaasRequest<{ externalReference?: string | null }>(
      `/paymentLinks/${paymentLinkId}`,
      "GET",
    );
    return parseExternalReference(link.externalReference);
  }

  async function normalize(event: AsaasWebhookEvent): Promise<NormalizedPaymentEvent> {
    const type = ASAAS_EVENT_MAP[event.event ?? ""] ?? "ignored";
    const base: NormalizedPaymentEvent = {
      type: "ignored",
      gateway: "asaas",
      externalSubscriptionId: null,
      externalCustomerId: null,
      companyId: null,
      planId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    if (type === "ignored") return base;

    if (type === "subscription.canceled") {
      const subscription = event.subscription;
      if (!subscription?.id) return base;
      const reference = parseExternalReference(subscription.externalReference);
      return {
        ...base,
        type,
        externalSubscriptionId: subscription.id,
        externalCustomerId: subscription.customer ?? null,
        companyId: reference?.companyId ?? null,
        planId: reference?.planId ?? null,
      };
    }

    // Eventos de pagamento: só interessam os de assinatura (avulsos são ignorados).
    const payment = event.payment;
    if (!payment?.subscription) return base;
    const subscription = await asaasRequest<AsaasSubscription>(
      `/subscriptions/${payment.subscription}`,
      "GET",
    );
    const reference = await resolveReference(subscription, payment.paymentLink);
    return {
      ...base,
      type,
      externalSubscriptionId: payment.subscription,
      externalCustomerId: payment.customer ?? subscription.customer ?? null,
      companyId: reference?.companyId ?? null,
      planId: reference?.planId ?? null,
      currentPeriodStart: dateToIso(payment.dueDate),
      currentPeriodEnd: dateToIso(subscription.nextDueDate),
    };
  }

  return {
    name: "asaas",

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      const link = await asaasRequest<{ id: string; url: string }>("/paymentLinks", "POST", {
        name: params.plan.name,
        description: `Assinatura do plano ${params.plan.name}`,
        value: toReais(params.plan.priceCents),
        // UNDEFINED: o cliente escolhe PIX, boleto ou cartão na página do Asaas.
        billingType: "UNDEFINED",
        chargeType: "RECURRENT",
        subscriptionCycle: params.plan.billingInterval === "year" ? "YEARLY" : "MONTHLY",
        dueDateLimitDays: 3,
        externalReference: `${params.companyId}:${params.plan.id}`,
        // O domínio de successUrl precisa estar cadastrado nas informações
        // comerciais da conta Asaas, senão a API recusa o link.
        callback: { successUrl: params.successUrl, autoRedirect: true },
      });
      return { id: link.id, url: link.url };
    },

    async cancelSubscription(externalSubscriptionId: string): Promise<void> {
      // Remove as cobranças futuras; o acesso até o fim do período é controlado no app.
      await asaasRequest(`/subscriptions/${externalSubscriptionId}`, "DELETE");
    },

    async getPortalUrl(): Promise<string | null> {
      return null;
    },

    async handleWebhook({ payload, headers }: WebhookRequest): Promise<NormalizedPaymentEvent> {
      const token = headers.get("asaas-access-token") ?? "";
      if (!token || !safeEqual(token, config.webhookToken)) {
        throw new AppError("payment_error", "Token de webhook inválido");
      }
      let event: AsaasWebhookEvent;
      try {
        event = JSON.parse(payload) as AsaasWebhookEvent;
      } catch {
        throw new AppError("payment_error", "Payload de webhook inválido");
      }
      return normalize(event);
    },

    async syncExtraSeats(update: ExtraSeatsUpdate): Promise<void> {
      const totalCents = update.basePriceCents + update.quantity * update.unitPriceCents;
      await asaasRequest(`/subscriptions/${update.externalSubscriptionId}`, "PUT", {
        value: toReais(totalCents),
        // Atualiza também a cobrança já gerada e ainda não paga.
        updatePendingPayments: true,
      });
    },
  };
}
