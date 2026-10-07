import "server-only";
import { createSupabaseChurchSelfPaymentRepository } from "@/repositories/supabase/churchSelfPaymentRepository";
import { createChurchSelfPaymentService, type ChurchSelfPaymentService } from "@/services/churchSelfPaymentService";
import { getRecurringBillingProvider } from "@/adapters/payment";
import { getSponsorSystemService } from "./sponsor";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Autopatrocínio, do lado da igreja. A cobrança de verdade (criar cliente e
 * assinatura no provedor) é feita por quem já sabe fazer isso —
 * `SponsorService.syncBilling`, montado com o client de sistema porque quem
 * paga aqui não é um patrocinador com sessão própria.
 */
export async function getChurchSelfPaymentService(): Promise<ChurchSelfPaymentService> {
  const client = await getSupabaseServerClient();
  return createChurchSelfPaymentService({
    repo: createSupabaseChurchSelfPaymentRepository(client),
    biller: getSponsorSystemService(),
    // Só aparece a opção de Pix se o provedor que atende as contas novas sabe fazê-lo.
    pixDisponivel: typeof getRecurringBillingProvider().createPixAutomatic === "function",
  });
}
