import { getServerEnv } from "@/config/env";
import { isAppError, toPublicError } from "@/lib/errors";
import { secretsMatch } from "@/lib/secrets";
import { getSponsorSystemService } from "@/server/sponsor";

/**
 * Job do patrocínio (Vercel Cron — ver vercel.json):
 * - reenvia ao provedor o valor recalculado de contas com sync pendente;
 * - encerra patrocínios com cancelamento agendado cujo ciclo já acabou.
 *
 * Mesmo modelo de segurança do job de domínios: CRON_SECRET no header.
 */

export const dynamic = "force-dynamic";
const SWEEP_LIMIT = 50;

export async function GET(request: Request) {
  const expected = getServerEnv().CRON_SECRET;
  if (!expected) {
    console.error("[cron/sponsor-billing] CRON_SECRET não configurado — job desativado");
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(provided, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await getSponsorSystemService().runSyncSweep(SWEEP_LIMIT);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (isAppError(err)) {
      console.error("[cron/sponsor-billing]", err.message, "internal:", err.internal);
    } else {
      console.error("[cron/sponsor-billing]", err);
    }
    return Response.json(
      { error: toPublicError(err) },
      { status: isAppError(err) ? err.status : 500 },
    );
  }
}
