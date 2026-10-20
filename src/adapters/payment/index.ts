import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { createFakeGateway } from "./fakeGateway";
import type { PaymentGateway } from "./PaymentGateway";
import { createStripeGateway } from "./stripeGateway";

export type { PaymentGateway } from "./PaymentGateway";

/**
 * Factory do gateway ativo, escolhido por PAYMENT_GATEWAY (env de servidor).
 * Trocar de provedor = implementar a interface e adicionar um case aqui.
 */
export function getPaymentGateway(): PaymentGateway {
  switch (getServerEnv().PAYMENT_GATEWAY) {
    case "stripe":
      return createStripeGateway({
        secretKey: requireServerEnv("STRIPE_SECRET_KEY"),
        webhookSecret: requireServerEnv("STRIPE_WEBHOOK_SECRET"),
      });
    case "fake":
      return createFakeGateway();
  }
}
