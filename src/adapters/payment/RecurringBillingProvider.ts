import type {
  BillingCustomerInput,
  BillingWebhookEvent,
  CreatePixAutomaticInput,
  CreateRecurringSubscriptionInput,
  CreatedPixAutomatic,
  CreatedRecurringSubscription,
} from "@/types/sponsorship";

/**
 * Cobrança recorrente de valor VARIÁVEL (patrocínio). Irmã de PaymentGateway,
 * que atende a assinatura SaaS da empresa por plano fixo.
 *
 * Regra do projeto: nenhum service ou componente fala com Asaas, Stripe ou
 * qualquer outro provedor direto. Trocar de provedor = implementar esta
 * interface e registrar em src/adapters/payment/index.ts.
 *
 * O valor da assinatura é decidido pela regra de negócio (soma dos tiers) e
 * EMPURRADO para o provedor. O provedor nunca calcula preço.
 */
export interface RecurringBillingProvider {
  /** Gravado em sponsor_accounts.gateway — é assim que a conta acha seu provedor. */
  readonly name: string;

  createCustomer(input: BillingCustomerInput): Promise<{ customerId: string }>;

  /** Cria a assinatura mensal no cartão, sem parcelamento. */
  createSubscription(input: CreateRecurringSubscriptionInput): Promise<CreatedRecurringSubscription>;

  /**
   * Troca o valor da assinatura. Vale para a próxima cobrança E para uma
   * cobrança já gerada e ainda não paga — senão o patrocinador que cancelou
   * uma igreja pagaria o valor antigo no ciclo seguinte.
   */
  updateSubscriptionAmount(subscriptionId: string, amountCents: number): Promise<void>;

  /** Encerra a assinatura. Assinatura inexistente NÃO é erro. */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Pix Automático: o pagador lê um QR Code no aplicativo do banco, paga a
   * primeira cobrança e autoriza os débitos dos meses seguintes, de valor
   * FIXO. OPCIONAL — provedor que não implementa simplesmente não oferece essa
   * forma (a tela só mostra a opção quando o método existe).
   */
  createPixAutomatic?(input: CreatePixAutomaticInput): Promise<CreatedPixAutomatic>;

  /** Cancela a autorização (e a assinatura ligada a ela). Inexistente NÃO é erro. */
  cancelPixAutomatic?(authorizationId: string): Promise<void>;

  /**
   * Autentica e traduz o webhook. Requisição não autenticada deve lançar
   * AppError("unauthorized") — nunca processar evento não verificado.
   */
  parseWebhook(input: { rawBody: string; headers: Headers }): Promise<BillingWebhookEvent>;
}
