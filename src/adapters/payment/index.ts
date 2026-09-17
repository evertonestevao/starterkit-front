import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createAsaasBillingProvider } from "./asaasBillingProvider";
import { createFakeBillingProvider } from "./fakeBillingProvider";
import { createFakeGateway } from "./fakeGateway";
import type { PaymentGateway } from "./PaymentGateway";
import type { RecurringBillingProvider } from "./RecurringBillingProvider";
import { createStripeGateway } from "./stripeGateway";

export type { PaymentGateway } from "./PaymentGateway";
export type { RecurringBillingProvider } from "./RecurringBillingProvider";

/**
 * PONTO ÚNICO de escolha de provedor de pagamento. Nenhum outro arquivo sabe
 * que Stripe ou Asaas existem.
 *
 * - getPaymentGateway: assinatura SaaS da empresa (plano fixo), por
 *   PAYMENT_GATEWAY.
 * - getRecurringBillingProvider: patrocínio (valor variável). O provedor fica
 *   gravado em cada conta; SPONSOR_BILLING_PROVIDER só decide quem atende as
 *   contas NOVAS. Trocar de provedor, portanto, não derruba quem já assina no
 *   anterior — os dois convivem até a migração.
 *
 * Provedor novo = implementar a interface e adicionar um case aqui.
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

export const RECURRING_BILLING_PROVIDERS = ["asaas", "fake"] as const;
export type RecurringBillingProviderName = (typeof RECURRING_BILLING_PROVIDERS)[number];

/** Provedor que atende contas novas. */
export function getDefaultRecurringBillingProviderName(): RecurringBillingProviderName {
  return getServerEnv().SPONSOR_BILLING_PROVIDER;
}

export function isRecurringBillingProviderName(name: string): name is RecurringBillingProviderName {
  return (RECURRING_BILLING_PROVIDERS as readonly string[]).includes(name);
}

/**
 * Resolve o provedor pelo NOME gravado na conta (ou o padrão, sem nome).
 */
export function getRecurringBillingProvider(name?: string | null): RecurringBillingProvider {
  const env = getServerEnv();
  const resolved = name ?? env.SPONSOR_BILLING_PROVIDER;

  switch (resolved) {
    case "asaas":
      return createAsaasBillingProvider({
        apiKey: requireServerEnv("ASAAS_API_KEY"),
        baseUrl: env.ASAAS_API_URL,
        webhookToken: env.ASAAS_WEBHOOK_TOKEN,
      });
    case "fake":
      // O webhook do fake aceita um token que está no código-fonte. Fora de
      // um ambiente configurado como fake, ele não pode ser alcançável.
      if (env.SPONSOR_BILLING_PROVIDER !== "fake") {
        throw new AppError("forbidden", "Provedor de cobrança indisponível", {
          requested: resolved,
        });
      }
      return createFakeBillingProvider();
    default:
      throw new AppError("internal_error", "Provedor de cobrança desconhecido", {
        requested: resolved,
      });
  }
}
