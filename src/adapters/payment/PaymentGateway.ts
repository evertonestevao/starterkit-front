import type {
  CheckoutSession,
  CreateCheckoutParams,
  NormalizedPaymentEvent,
} from "@/types/billing";

/**
 * Interface única de gateway de pagamento (regra do CLAUDE.md: nenhum service
 * ou componente chama SDK de provedor direto). Cada provedor — Stripe,
 * Mercado Pago, Asaas... — implementa esta interface em src/adapters/payment.
 */
export interface PaymentGateway {
  /** Nome do provedor, gravado em subscriptions p/ rastreio (neutro no schema). */
  readonly name: string;

  createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession>;

  /** Cancela ao fim do período vigente (não corta acesso já pago). */
  cancelSubscription(externalSubscriptionId: string): Promise<void>;

  /** URL do portal de autogestão do cliente (troca de cartão, faturas). */
  getPortalUrl(externalCustomerId: string, returnUrl: string): Promise<string>;

  /**
   * Valida a assinatura do webhook e converte o payload cru do provedor em um
   * evento interno normalizado. Payload inválido/não assinado deve lançar
   * AppError("payment_error") — nunca processar evento não verificado.
   */
  handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent>;
}
