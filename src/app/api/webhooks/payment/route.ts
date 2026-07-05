import { getPaymentGateway } from "@/adapters/payment";
import { toPublicError, isAppError } from "@/lib/errors";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { createBillingService } from "@/services/billingService";

/**
 * Webhook de pagamento (qualquer gateway). O adapter valida a assinatura e
 * normaliza o evento; o service aplica na tabela subscriptions. Usa
 * service_role porque webhook não tem sessão de usuário — a segurança vem da
 * verificação de assinatura no adapter.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature =
    request.headers.get("stripe-signature") ?? request.headers.get("x-webhook-signature") ?? "";

  try {
    const gateway = getPaymentGateway();
    const event = await gateway.handleWebhook(payload, signature);

    const billing = createBillingService(
      createSupabaseBillingRepository(getSupabaseAdminClient()),
    );
    await billing.applyPaymentEvent(event);

    return Response.json({ received: true });
  } catch (err) {
    // Log detalhado só no servidor; nunca o payload cru (regra do CLAUDE.md).
    console.error("[webhook/payment]", isAppError(err) ? err.message : err);
    const publicError = toPublicError(err);
    return Response.json({ error: publicError }, { status: isAppError(err) ? err.status : 500 });
  }
}
