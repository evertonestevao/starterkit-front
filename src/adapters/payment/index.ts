import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { createAsaasGateway } from "./asaasGateway";
import { createFakeGateway } from "./fakeGateway";
import type { PaymentGateway } from "./PaymentGateway";
import { createStripeGateway } from "./stripeGateway";

export type { PaymentGateway } from "./PaymentGateway";

/**
 * Factory do gateway ativo, escolhido por PAYMENT_GATEWAY (env de servidor).
 * Trocar de provedor = implementar a interface e adicionar um case aqui
 * (passo a passo em PaymentGateway.ts).
 */
export function getPaymentGateway(): PaymentGateway {
  switch (getServerEnv().PAYMENT_GATEWAY) {
    case "stripe":
      return createStripeGateway({
        secretKey: requireServerEnv("STRIPE_SECRET_KEY"),
        webhookSecret: requireServerEnv("STRIPE_WEBHOOK_SECRET"),
      });
    case "asaas":
      return createAsaasGateway({
        apiKey: requireServerEnv("ASAAS_API_KEY"),
        webhookToken: requireServerEnv("ASAAS_WEBHOOK_TOKEN"),
        environment: getServerEnv().ASAAS_ENVIRONMENT,
      });
    case "fake":
      return createFakeGateway();
  }
}
