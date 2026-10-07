import { getServerEnv } from "@/config/env";
import { isAppError, toPublicError } from "@/lib/errors";
import { secretsMatch } from "@/lib/secrets";
import { getChurchDomainSweepService } from "@/server/churchDomain";

/**
 * Job de verificação dos domínios próprios (Vercel Cron — ver vercel.json).
 *
 * Pergunta ao provedor, para cada domínio pendente, se a posse já foi provada e
 * se o DNS já aponta para cá; promove para `ativo` quando sim. É o único lugar,
 * junto do botão "Verificar agora", que consegue ativar um domínio — e sempre
 * com a confirmação do provedor na mão.
 *
 * Não tem sessão de usuário: a segurança é o CRON_SECRET, do mesmo jeito que o
 * webhook de pagamento se apoia na assinatura.
 */

export const dynamic = "force-dynamic";
/** Lote pequeno: o job roda de novo em minutos, não precisa varrer tudo. */
const SWEEP_LIMIT = 25;

export async function GET(request: Request) {
  const expected = getServerEnv().CRON_SECRET;

  // Sem segredo configurado o endpoint fica fechado: um cron aberto deixaria
  // qualquer um disparar chamadas à API da Vercel em nome do projeto.
  if (!expected) {
    console.error("[cron/domains] CRON_SECRET não configurado — job desativado");
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(provided, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await getChurchDomainSweepService().runVerificationSweep(SWEEP_LIMIT);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (isAppError(err)) {
      console.error("[cron/domains]", err.message, "internal:", err.internal);
    } else {
      console.error("[cron/domains]", err);
    }
    return Response.json(
      { error: toPublicError(err) },
      { status: isAppError(err) ? err.status : 500 },
    );
  }
}
