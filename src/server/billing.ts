import "server-only";
import { getPaymentGateway } from "@/adapters/payment";
import { getServerEnv } from "@/config/env";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createBillingService, type BillingService } from "@/services/billingService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Mapeamento plano -> price do gateway, via env (STRIPE_PRICE_PRO etc.).
 * Sem a env configurada cai num placeholder que NÃO funciona no Stripe real
 * (o gateway fake ignora) — e loga um aviso para não passar despercebido.
 */
export function getGatewayPriceIdForPlan(planCode: string): string {
  const env = getServerEnv();
  const byCode: Record<string, string | undefined> = {
    pro: env.STRIPE_PRICE_PRO,
    enterprise: env.STRIPE_PRICE_ENTERPRISE,
  };
  const configured = byCode[planCode];
  if (configured) return configured;
  if (env.PAYMENT_GATEWAY !== "fake") {
    console.warn(
      `[billing] STRIPE_PRICE_${planCode.toUpperCase()} não configurada — usando placeholder que falhará no Stripe real`,
    );
  }
  return `price_${planCode}`;
}

/** Price do seat extra (mesmo racional acima). */
export function getExtraSeatPriceId(): string {
  const env = getServerEnv();
  if (env.STRIPE_PRICE_EXTRA_SEAT) return env.STRIPE_PRICE_EXTRA_SEAT;
  if (env.PAYMENT_GATEWAY !== "fake") {
    console.warn(
      "[billing] STRIPE_PRICE_EXTRA_SEAT não configurada — usando placeholder que falhará no Stripe real",
    );
  }
  return "price_extra_seat";
}

export async function getServerBillingService(): Promise<BillingService> {
  const client = await getSupabaseServerClient();
  return createBillingService(createSupabaseBillingRepository(client));
}

/**
 * Ressincroniza os seats extras da empresa com o gateway após mudanças de
 * quadro (convite criado/revogado, membro removido). Falha aqui NÃO desfaz a
 * operação principal — cobrança é reconciliável; log fica no servidor.
 */
export async function syncCompanySeats(companyId: string): Promise<void> {
  try {
    const billing = await getServerBillingService();
    await billing.syncSeatsWithGateway(companyId, getPaymentGateway(), getExtraSeatPriceId());
  } catch (err) {
    console.error("[billing] falha ao sincronizar seats:", err);
  }
}
