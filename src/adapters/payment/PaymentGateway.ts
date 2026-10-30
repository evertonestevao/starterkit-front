import type {
  CheckoutSession,
  CreateCheckoutParams,
  ExtraSeatsUpdate,
  NormalizedPaymentEvent,
  WebhookRequest,
} from "@/types/billing";

/**
 * Interface única de gateway de pagamento (regra do CLAUDE.md: nenhum service
 * ou componente chama SDK de provedor direto).
 *
 * PARA ADICIONAR UM PROVEDOR (Mercado Pago, Pagar.me, Iugu...):
 *  1. Crie src/adapters/payment/<provedor>Gateway.ts implementando esta
 *     interface, via fetch na API REST (sem SDK, como Stripe e Asaas).
 *  2. Normalize os eventos do webhook para NormalizedPaymentEvent. A regra de
 *     negócio só conhece esses eventos.
 *  3. Adicione o nome em PAYMENT_GATEWAY (src/config/env.ts), as envs do
 *     provedor e um case na factory (./index.ts).
 *  4. Escreva <provedor>Gateway.test.ts com fetch injetado: checkout, webhook
 *     válido/inválido, normalização de eventos e seats extras.
 * Nada fora de src/adapters/payment e src/config/env.ts precisa mudar.
 */
export interface PaymentGateway {
  /** Nome do provedor, gravado em subscriptions p/ rastreio (neutro no schema). */
  readonly name: string;

  /** Cria a sessão de pagamento hospedada pelo provedor e devolve a URL. */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession>;

  /** Cancela a assinatura no provedor. O acesso segue até o fim do período pago. */
  cancelSubscription(externalSubscriptionId: string): Promise<void>;

  /**
   * URL do portal de autogestão do cliente (troca de cartão, faturas), ou
   * null se o provedor não tem portal — a UI esconde o botão.
   */
  getPortalUrl(externalCustomerId: string, returnUrl: string): Promise<string | null>;

  /**
   * Valida a autenticidade do webhook (HMAC, token...) com os headers do
   * próprio provedor e converte o payload em evento normalizado. Webhook
   * inválido lança AppError("payment_error") — nunca processar evento não verificado.
   */
  handleWebhook(request: WebhookRequest): Promise<NormalizedPaymentEvent>;

  /** Ajusta a cobrança de seats extras na assinatura. */
  syncExtraSeats(update: ExtraSeatsUpdate): Promise<void>;
}
