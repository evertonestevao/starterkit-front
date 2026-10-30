/** Types de billing neutros de provedor — nada de stripe_* fora do adapter. */

/**
 * Plano como o gateway o recebe: valor E id externo opcional. Gateways com
 * catálogo de preços (Stripe) usam `externalPriceId`; gateways que cobram por
 * valor (Asaas, Mercado Pago) usam `priceCents`.
 */
export interface CheckoutPlan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: "month" | "year";
  /** Id do preço no catálogo do gateway (PAYMENT_PRICE_<PLANO>), ou null. */
  externalPriceId: string | null;
}

export interface CreateCheckoutParams {
  companyId: string;
  plan: CheckoutPlan;
  customer: { email: string; name: string | null };
  successUrl: string;
  cancelUrl: string;
}

/** Request de webhook como chega na rota: cada gateway lê o próprio header. */
export interface WebhookRequest {
  payload: string;
  headers: Headers;
}

/**
 * Cobrança de seats extras. Cada gateway aplica do seu jeito: item com
 * quantidade (Stripe) ou novo valor total da assinatura (Asaas).
 */
export interface ExtraSeatsUpdate {
  externalSubscriptionId: string;
  /** Seats além do incluso no plano; 0 remove a cobrança extra. */
  quantity: number;
  unitPriceCents: number;
  /** Valor do plano base, para gateways que cobram um valor total. */
  basePriceCents: number;
  /** Id do preço por seat no catálogo do gateway (PAYMENT_PRICE_EXTRA_SEAT), ou null. */
  externalPriceId: string | null;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * Eventos de webhook de QUALQUER gateway são normalizados para estes tipos
 * antes de tocar a lógica de negócio (ver starter-kit-saas-plano.md §7).
 */
export type PaymentEventType =
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.canceled"
  | "payment.failed"
  | "payment.refunded"
  | "ignored";

export interface NormalizedPaymentEvent {
  type: PaymentEventType;
  gateway: string;
  externalSubscriptionId: string | null;
  externalCustomerId: string | null;
  /** Vindos de metadata gravada na criação do checkout. */
  companyId: string | null;
  planId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Pagamento confirmado que gerou o evento. Sem isto, não há comissão (ex.: Stripe). */
  payment?: { externalId: string; grossAmountCents: number };
  /** Estorno: total estornado até agora; null = integral. */
  refund?: { externalPaymentId: string; refundedCents: number | null };
}
