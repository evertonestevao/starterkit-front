import { isReceivingProviderName } from "@/adapters/payment";
import { isAppError, toPublicError } from "@/lib/errors";
import { getDonationWebhookHandler } from "@/server/churchReceiving";

/**
 * Webhook das doações: /api/webhooks/donations/{provedor}.
 *
 * Cada igreja tem a SUA subconta e o SEU token, definido quando a conta foi
 * criada. Por isso o caminho é: descobrir de qual subconta veio o evento,
 * buscar o token daquela igreja e só então autenticar. Um token vazado
 * derruba a confiança de uma igreja, não a de todas.
 *
 * Fica fora do proxy (o matcher exclui api/webhooks): não há sessão.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isReceivingProviderName(provider)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();

  try {
    const { outcome } = await getDonationWebhookHandler(provider).handle(rawBody, request.headers);
    return Response.json({ received: true, outcome });
  } catch (err) {
    // Nunca logar o corpo cru: carrega dados de cobrança (CLAUDE.md).
    if (isAppError(err)) {
      console.error(`[webhook/donations/${provider}]`, err.message, "internal:", err.internal);
    } else {
      console.error(`[webhook/donations/${provider}]`, err);
    }
    return Response.json(
      { error: toPublicError(err) },
      { status: isAppError(err) ? err.status : 500 },
    );
  }
}
