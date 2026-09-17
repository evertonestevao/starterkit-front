import { getRecurringBillingProvider, isRecurringBillingProviderName } from "@/adapters/payment";
import { isAppError, toPublicError } from "@/lib/errors";
import { getSponsorSystemService } from "@/server/sponsor";

/**
 * Webhook de cobrança do patrocínio: /api/webhooks/sponsor-billing/{provedor}.
 *
 * O provedor vai no CAMINHO (e não é inferido do corpo) para que dois
 * provedores recebam eventos ao mesmo tempo durante uma migração. Quem
 * autentica é o adapter; aqui só se roteia e aplica.
 *
 * Fica fora do proxy (matcher exclui api/webhooks): não há sessão de usuário.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await params;
  if (!isRecurringBillingProviderName(providerName)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();

  try {
    const provider = getRecurringBillingProvider(providerName);
    const event = await provider.parseWebhook({ rawBody, headers: request.headers });
    const outcome = await getSponsorSystemService().applyBillingEvent(event);
    return Response.json({ received: true, outcome });
  } catch (err) {
    // Nunca logar o corpo cru: carrega dados de cobrança (CLAUDE.md).
    if (isAppError(err)) {
      console.error(`[webhook/sponsor-billing/${providerName}]`, err.message, "internal:", err.internal);
    } else {
      console.error(`[webhook/sponsor-billing/${providerName}]`, err);
    }
    return Response.json(
      { error: toPublicError(err) },
      { status: isAppError(err) ? err.status : 500 },
    );
  }
}
