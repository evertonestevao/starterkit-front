import "server-only";
import { getPaymentGateway } from "@/adapters/payment";
import { getServerEnv } from "@/config/env";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createBillingService, type BillingService } from "@/services/billingService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Id do preço no catálogo do gateway, por plano (PAYMENT_PRICE_<CODE>, com
 * STRIPE_PRICE_<CODE> como nome antigo). null quando não configurado: gateway
 * que precisa de catálogo (Stripe) recusa com erro claro; gateway que cobra
 * por valor (Asaas) não usa.
 */
export function getExternalPriceId(key: "pro" | "enterprise" | "extra_seat" | string): string | null {
  const env = getServerEnv() as Record<string, unknown>;
  const suffix = key.toUpperCase();
  const value = env[`PAYMENT_PRICE_${suffix}`] ?? env[`STRIPE_PRICE_${suffix}`];
  return typeof value === "string" && value ? value : null;
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
    await billing.syncSeatsWithGateway(
      companyId,
      getPaymentGateway(),
      getExternalPriceId("extra_seat"),
    );
  } catch (err) {
    console.error("[billing] falha ao sincronizar seats:", err);
  }
}
