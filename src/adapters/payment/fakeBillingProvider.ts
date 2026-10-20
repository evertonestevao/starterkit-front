import { AppError } from "@/lib/errors";
import { secretsMatch } from "@/lib/secrets";
import type { BillingWebhookEvent } from "@/types/sponsorship";
import type { RecurringBillingProvider } from "./RecurringBillingProvider";

/**
 * Provedor de cobrança de mentira para dev e testes: nenhuma rede, nenhuma
 * chave. A 1ª cobrança "nasce paga" (via immediateEvents), para o fluxo
 * inteiro — patrocinar, ver no painel, cancelar — funcionar localmente.
 *
 * O webhook aceita o evento já normalizado (JSON de BillingWebhookEvent) com o
 * token fixo abaixo — útil para simular atraso ou estorno com um curl.
 */

export const FAKE_BILLING_WEBHOOK_TOKEN = "fake-billing-token";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function createFakeBillingProvider(): RecurringBillingProvider {
  return {
    name: "fake",

    async createCustomer() {
      return { customerId: nextId("fake_cus") };
    },

    async createSubscription(input) {
      const subscriptionId = nextId("fake_sub");
      const paymentId = nextId("fake_pay");
      return {
        subscriptionId,
        firstInvoiceUrl: null,
        immediateEvents: [
          {
            kind: "charge",
            provider: "fake",
            charge: {
              paymentId,
              subscriptionId,
              amountCents: input.amountCents,
              dueDate: input.nextDueDate,
              status: "paid",
              paidAt: new Date().toISOString(),
              invoiceUrl: null,
            },
          },
        ],
      };
    },

    /**
     * Pix Automático de mentira: devolve um "copia e cola" que carrega a
     * assinatura, e NÃO paga sozinho — assim a tela de "aguardando" existe em
     * dev. Para confirmar, mande o evento de cobrança paga ao webhook do fake
     * (o teste e2e faz isso a partir do que está no copia e cola).
     */
    async createPixAutomatic(input) {
      const subscriptionId = nextId("fake_sub");
      return {
        authorizationId: nextId("fake_aut"),
        subscriptionId,
        qrPayload: `FAKEPIX|${subscriptionId}|${input.amountCents}|${input.startDate}`,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      };
    },

    async cancelPixAutomatic(authorizationId) {
      console.info(`[billing:fake] autorização de Pix Automático ${authorizationId} cancelada`);
    },

    async updateSubscriptionAmount(subscriptionId, amountCents) {
      console.info(`[billing:fake] assinatura ${subscriptionId} -> ${amountCents} centavos`);
    },

    async cancelSubscription(subscriptionId) {
      console.info(`[billing:fake] assinatura ${subscriptionId} cancelada`);
    },

    async parseWebhook({ rawBody, headers }) {
      const provided = headers.get("x-fake-billing-token") ?? "";
      if (!secretsMatch(provided, FAKE_BILLING_WEBHOOK_TOKEN)) {
        throw new AppError("unauthorized", "Webhook não autenticado");
      }
      try {
        return JSON.parse(rawBody) as BillingWebhookEvent;
      } catch {
        throw new AppError("validation_error", "Webhook com corpo inválido");
      }
    },
  };
}
