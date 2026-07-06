import "server-only";
import { getPaymentGateway } from "@/adapters/payment";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createBillingService, type BillingService } from "@/services/billingService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * PLACEHOLDER (mesma dívida do gatewayPriceId do checkout): id do preço
 * "seat extra" no provedor real. Ao plugar o Stripe de verdade, crie o price
 * por assento no painel e mapeie aqui (ex.: via env STRIPE_PRICE_EXTRA_SEAT).
 * O gateway fake ignora este valor.
 */
export const GATEWAY_EXTRA_SEAT_PRICE_ID = "price_extra_seat";

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
      GATEWAY_EXTRA_SEAT_PRICE_ID,
    );
  } catch (err) {
    console.error("[billing] falha ao sincronizar seats:", err);
  }
}
