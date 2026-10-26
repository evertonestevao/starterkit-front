import { reportError } from "@/adapters/errorReporting";
import { getPaymentGateway } from "@/adapters/payment";
import { toPublicError, isAppError } from "@/lib/errors";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { createAuditService } from "@/services/auditService";
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

    const admin = getSupabaseAdminClient();
    const billing = createBillingService(createSupabaseBillingRepository(admin));
    await billing.applyPaymentEvent(event);

    // Evento de sistema na trilha (user_id null): só quando conseguimos
    // atribuir a empresa; eventos "ignored" não sujam a auditoria.
    if (event.type !== "ignored" && event.companyId) {
      await createAuditService(createSupabaseAuditRepository(admin)).record({
        companyId: event.companyId,
        userId: null,
        action: event.type,
        entityType: "subscription",
        metadata: { gateway: event.gateway, plan_id: event.planId },
      });
    }

    return Response.json({ received: true });
  } catch (err) {
    // Log detalhado só no servidor; nunca o payload cru (regra do CLAUDE.md).
    // O reporter recebe só o erro, nunca o payload.
    await reportError(err, { source: "route:/api/webhooks/payment" });
    const publicError = toPublicError(err);
    return Response.json({ error: publicError }, { status: isAppError(err) ? err.status : 500 });
  }
}
