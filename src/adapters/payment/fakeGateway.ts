import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  NormalizedPaymentEvent,
  WebhookRequest,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/**
 * Gateway fake para desenvolvimento local e testes: não fala com provedor
 * nenhum e aceita webhooks já no formato normalizado (JSON de
 * NormalizedPaymentEvent) com o header x-webhook-signature: fake-signature.
 */
export function createFakeGateway(): PaymentGateway {
  return {
    name: "fake",

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      return {
        id: `fake_checkout_${params.plan.id}`,
        url: `${params.successUrl}?fake_checkout=1&plan_id=${params.plan.id}`,
      };
    },

    async cancelSubscription(): Promise<void> {
      // Nada a cancelar num gateway fake.
    },

    async getPortalUrl(): Promise<string | null> {
      return null;
    },

    async handleWebhook({ payload, headers }: WebhookRequest): Promise<NormalizedPaymentEvent> {
      if (headers.get("x-webhook-signature") !== "fake-signature") {
        throw new AppError("payment_error", "Assinatura de webhook inválida");
      }
      return JSON.parse(payload) as NormalizedPaymentEvent;
    },

    async syncExtraSeats({ externalSubscriptionId, quantity }): Promise<void> {
      // Gateway fake: nada a cobrar; loga para o dev ver o ciclo funcionando.
      console.info(
        `[payment:fake] syncExtraSeats sub=${externalSubscriptionId} extras=${quantity}`,
      );
    },
  };
}
