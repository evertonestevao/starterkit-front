import { AppError } from "@/lib/errors";
import { secretsMatch } from "@/lib/secrets";
import type {
  BillingChargeSnapshot,
  BillingWebhookEvent,
  SponsorChargeStatus,
} from "@/types/sponsorship";
import type { RecurringBillingProvider } from "./RecurringBillingProvider";

/**
 * Adapter Asaas (API v3) via fetch, sem SDK — mesma escolha do stripeGateway.
 *
 * Pontos do Asaas que moldam este arquivo:
 * - Valores trafegam em REAIS com casas decimais; aqui dentro é tudo centavos.
 * - Autenticação por header `access_token`.
 * - Webhook NÃO é assinado: o Asaas envia o token configurado no painel no
 *   header `asaas-access-token`. Sem token configurado, recusamos tudo.
 * - Assinatura no cartão criada SEM dados do cartão: o Asaas gera a fatura e o
 *   patrocinador informa o cartão na página dele, que fica salvo para os
 *   próximos ciclos. Nenhum dado de cartão passa pelo nosso servidor.
 *
 * VERIFICAR NO SANDBOX antes de produção: verbo e campos da atualização de
 * valor (`updatePendingPayments`) e o comportamento de assinatura CREDIT_CARD
 * criada sem cartão — confirmados em documentação, não em conta real.
 */

export const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

export interface AsaasBillingProviderConfig {
  apiKey: string;
  baseUrl?: string;
  /** Token que o painel do Asaas envia em `asaas-access-token`. */
  webhookToken?: string;
  fetchFn?: typeof fetch;
}

interface AsaasError {
  errors?: Array<{ code?: string; description?: string }>;
}

interface AsaasPayment {
  id?: string;
  subscription?: string | null;
  value?: number;
  dueDate?: string;
  status?: string;
  invoiceUrl?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
}

/** Reais (número do Asaas) -> centavos, sem erro de ponto flutuante. */
export function reaisToCents(value: number): number {
  return Math.round(value * 100);
}

/** Centavos -> reais com duas casas, como o Asaas espera. */
export function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const REFUNDED_STATUSES = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

/** Status do Asaas -> nosso status. Desconhecido vira `pending` (conservador). */
export function mapAsaasPaymentStatus(status: string | undefined, event: string): SponsorChargeStatus {
  if (event === "PAYMENT_DELETED") return "canceled";
  if (!status) return "pending";
  if (PAID_STATUSES.has(status)) return "paid";
  if (status === "OVERDUE") return "overdue";
  if (REFUNDED_STATUSES.has(status)) return "refunded";
  return "pending";
}

export function createAsaasBillingProvider(config: AsaasBillingProviderConfig): RecurringBillingProvider {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = (config.baseUrl ?? ASAAS_SANDBOX_URL).replace(/\/+$/, "");

  async function asaasRequest<T>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: Record<string, unknown>,
    tolerate: number[] = [],
  ): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers: {
          access_token: config.apiKey,
          "User-Agent": "tag-igreja",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new AppError(
        "payment_error",
        "Não foi possível falar com o provedor de pagamentos agora. Tente de novo em instantes.",
        err,
      );
    }

    const data = (await res.json().catch(() => ({}))) as T & AsaasError;
    if (!res.ok && !tolerate.includes(res.status)) {
      // Detalhe do provedor só no log (internal); a chave nunca está aqui,
      // porque só existe no header.
      throw new AppError("payment_error", "O provedor de pagamentos recusou a operação.", {
        status: res.status,
        errors: data.errors,
      });
    }
    return { status: res.status, data };
  }

  function toSnapshot(payment: AsaasPayment, event: string): BillingChargeSnapshot {
    if (!payment.id || typeof payment.value !== "number" || !payment.dueDate) {
      throw new AppError("payment_error", "Webhook do provedor com cobrança incompleta", {
        event,
      });
    }
    const status = mapAsaasPaymentStatus(payment.status, event);
    const paidDate = payment.confirmedDate ?? payment.paymentDate ?? payment.clientPaymentDate;
    return {
      paymentId: payment.id,
      subscriptionId: payment.subscription ?? null,
      amountCents: reaisToCents(payment.value),
      dueDate: payment.dueDate,
      status,
      paidAt: status === "paid" && paidDate ? new Date(`${paidDate}T12:00:00Z`).toISOString() : null,
      invoiceUrl: payment.invoiceUrl ?? null,
    };
  }

  return {
    name: "asaas",

    async createCustomer(input) {
      const { data } = await asaasRequest<{ id?: string }>("/customers", "POST", {
        name: input.name,
        email: input.email,
        cpfCnpj: input.document,
        mobilePhone: input.phone ?? undefined,
        externalReference: input.externalReference,
      });
      if (!data.id) {
        throw new AppError("payment_error", "O provedor não devolveu o cliente criado.");
      }
      return { customerId: data.id };
    },

    async createSubscription(input) {
      const { data } = await asaasRequest<{ id?: string }>("/subscriptions", "POST", {
        customer: input.customerId,
        billingType: "CREDIT_CARD",
        value: centsToReais(input.amountCents),
        nextDueDate: input.nextDueDate,
        cycle: "MONTHLY",
        description: input.description,
        externalReference: input.externalReference,
        // Para onde o Asaas devolve quem acabou de pagar. Sem isso, o
        // patrocinador fica parado na tela do provedor.
        ...(input.successUrl
          ? { callback: { successUrl: input.successUrl, autoRedirect: true } }
          : {}),
      });
      if (!data.id) {
        throw new AppError("payment_error", "O provedor não devolveu a assinatura criada.");
      }

      // A 1ª cobrança é gerada junto; o link dela é onde o cartão é informado.
      const payments = await asaasRequest<{ data?: AsaasPayment[] }>(
        `/subscriptions/${encodeURIComponent(data.id)}/payments?limit=1`,
        "GET",
      ).catch(() => ({ status: 0, data: { data: [] as AsaasPayment[] } }));

      return {
        subscriptionId: data.id,
        firstInvoiceUrl: payments.data.data?.[0]?.invoiceUrl ?? null,
      };
    },

    async updateSubscriptionAmount(subscriptionId, amountCents) {
      await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, "PUT", {
        value: centsToReais(amountCents),
        // Cobrança já gerada e não paga também passa a valer o total novo.
        updatePendingPayments: true,
      });
    },

    async cancelSubscription(subscriptionId) {
      await asaasRequest(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        "DELETE",
        undefined,
        [404],
      );
    },

    async parseWebhook({ rawBody, headers }) {
      // Sem token configurado, qualquer um forjaria "pagamento confirmado".
      if (!config.webhookToken) {
        throw new AppError("unauthorized", "Webhook do provedor não configurado");
      }
      const provided = headers.get("asaas-access-token") ?? "";
      if (!secretsMatch(provided, config.webhookToken)) {
        throw new AppError("unauthorized", "Webhook não autenticado");
      }

      let payload: { event?: string; payment?: AsaasPayment };
      try {
        payload = JSON.parse(rawBody) as typeof payload;
      } catch {
        throw new AppError("validation_error", "Webhook com corpo inválido");
      }

      const event = payload.event ?? "";
      if (!event.startsWith("PAYMENT_") || !payload.payment) {
        return { kind: "ignored", provider: "asaas" } satisfies BillingWebhookEvent;
      }
      // Cobrança avulsa (fora de assinatura) não é patrocínio.
      if (!payload.payment.subscription) {
        return { kind: "ignored", provider: "asaas" } satisfies BillingWebhookEvent;
      }

      return {
        kind: "charge",
        provider: "asaas",
        charge: toSnapshot(payload.payment, event),
      } satisfies BillingWebhookEvent;
    },
  };
}
