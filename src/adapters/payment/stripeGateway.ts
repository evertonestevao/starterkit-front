import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  NormalizedPaymentEvent,
  PaymentEventType,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/**
 * Adapter Stripe via API REST (fetch + form-encoded), sem SDK — evita
 * dependência nova e mantém o provedor 100% atrás da interface PaymentGateway.
 * Só roda no servidor: exige secret key e webhook secret.
 */

const STRIPE_API = "https://api.stripe.com/v1";
/** Tolerância de replay do webhook, igual à default do SDK oficial. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

interface StripeGatewayConfig {
  secretKey: string;
  webhookSecret: string;
}

export function createStripeGateway(config: StripeGatewayConfig): PaymentGateway {
  async function stripeRequest(
    path: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      // Detalhe do provedor vai só para o log de servidor via `internal`.
      throw new AppError("payment_error", "Falha na operação de pagamento", json);
    }
    return json;
  }

  return {
    name: "stripe",

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      const session = await stripeRequest("/checkout/sessions", {
        mode: "subscription",
        "line_items[0][price]": params.gatewayPriceId,
        "line_items[0][quantity]": "1",
        customer_email: params.customerEmail,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        client_reference_id: params.companyId,
        // Metadata na assinatura: volta em todo webhook de subscription,
        // permitindo mapear evento -> empresa/plano sem tabela de-para.
        "subscription_data[metadata][company_id]": params.companyId,
        "subscription_data[metadata][plan_id]": params.planId,
      });
      return { id: String(session.id), url: String(session.url) };
    },

    async cancelSubscription(externalSubscriptionId: string): Promise<void> {
      await stripeRequest(`/subscriptions/${externalSubscriptionId}`, {
        cancel_at_period_end: "true",
      });
    },

    async getPortalUrl(externalCustomerId: string, returnUrl: string): Promise<string> {
      const session = await stripeRequest("/billing_portal/sessions", {
        customer: externalCustomerId,
        return_url: returnUrl,
      });
      return String(session.url);
    },

    async handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent> {
      const valid = await verifyStripeSignature(payload, signature, config.webhookSecret);
      if (!valid) {
        throw new AppError("payment_error", "Assinatura de webhook inválida");
      }
      return normalizeStripeEvent(JSON.parse(payload));
    },
  };
}

/**
 * Verifica o header Stripe-Signature: `t=<ts>,v1=<hmac>,...` onde o HMAC-SHA256
 * é calculado sobre `<ts>.<payload>` com o webhook secret. Rejeita timestamps
 * fora da tolerância (replay) e compara em tempo constante.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts = new Map(
    signatureHeader.split(",").map((pair) => {
      const idx = pair.indexOf("=");
      return [pair.slice(0, idx).trim(), pair.slice(idx + 1)] as const;
    }),
  );
  const timestamp = parts.get("t");
  const expected = parts.get("v1");
  if (!timestamp || !expected) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const STRIPE_EVENT_MAP: Record<string, PaymentEventType> = {
  "customer.subscription.created": "subscription.activated",
  "customer.subscription.updated": "subscription.updated",
  "customer.subscription.deleted": "subscription.canceled",
  "invoice.payment_failed": "payment.failed",
};

interface StripeEvent {
  type?: string;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      subscription?: string;
      metadata?: Record<string, string>;
      cancel_at_period_end?: boolean;
      items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
    };
  };
}

function toIso(epochSeconds: number | undefined): string | null {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

/** Converte o evento cru do Stripe no evento interno neutro. */
export function normalizeStripeEvent(event: StripeEvent): NormalizedPaymentEvent {
  const type = STRIPE_EVENT_MAP[event.type ?? ""] ?? "ignored";
  const object = event.data?.object ?? {};
  const item = object.items?.data?.[0];
  const isInvoice = event.type?.startsWith("invoice.") ?? false;
  return {
    type,
    gateway: "stripe",
    externalSubscriptionId: (isInvoice ? object.subscription : object.id) ?? null,
    externalCustomerId: object.customer ?? null,
    companyId: object.metadata?.company_id ?? null,
    planId: object.metadata?.plan_id ?? null,
    currentPeriodStart: toIso(item?.current_period_start),
    currentPeriodEnd: toIso(item?.current_period_end),
    cancelAtPeriodEnd: object.cancel_at_period_end ?? false,
  };
}
