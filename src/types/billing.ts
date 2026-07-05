/** Types de billing neutros de provedor — nada de stripe_* fora do adapter. */

export interface CreateCheckoutParams {
  companyId: string;
  planId: string;
  /** Preço no gateway (ex.: price_xxx no Stripe). Mapeado por plano na config. */
  gatewayPriceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
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
}
