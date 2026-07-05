import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  NormalizedPaymentEvent,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/**
 * Gateway fake para desenvolvimento local e testes: não fala com provedor
 * nenhum e aceita webhooks já no formato normalizado (JSON de
 * NormalizedPaymentEvent) com assinatura fixa "fake-signature".
 */
export function createFakeGateway(): PaymentGateway {
  return {
    name: "fake",

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      return {
        id: `fake_checkout_${params.planId}`,
        url: `${params.successUrl}?fake_checkout=1&plan_id=${params.planId}`,
      };
    },

    async cancelSubscription(): Promise<void> {
      // Nada a cancelar num gateway fake.
    },

    async getPortalUrl(_customerId: string, returnUrl: string): Promise<string> {
      return returnUrl;
    },

    async handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent> {
      if (signature !== "fake-signature") {
        throw new AppError("payment_error", "Assinatura de webhook inválida");
      }
      return JSON.parse(payload) as NormalizedPaymentEvent;
    },
  };
}
