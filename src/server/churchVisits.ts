import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { isAppError } from "@/lib/errors";
import { parseVisitOrigin } from "@/lib/churchVisits";
import {
  createSupabaseChurchVisitRepository,
  createSupabaseVisitMetricsRepository,
} from "@/repositories/supabase/churchVisitRepository";
import { createChurchVisitService, type VisitDeduper } from "@/services/churchVisitService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * A mesma pessoa abrindo a página de novo em 30 minutos conta uma vez só.
 * Com RATE_LIMIT_STORE=memory isso vale por instância (em serverless, pouco);
 * com redis, vale para todas.
 */
const visitLimiter = createRateLimiter({ limit: 1, windowMs: 30 * 60_000 });

const deduper: VisitDeduper = {
  async firstInWindow(key) {
    try {
      await visitLimiter.consume(`church-visit:${key}`);
      return true;
    } catch (err) {
      if (isAppError(err) && err.code === "rate_limited") return false;
      throw err;
    }
  },
};

/** IP vira hash antes de sair daqui: nem o store de rate limit guarda o IP. */
function visitorKey(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Registra a abertura da página pública DEPOIS da resposta (`after`): a
 * contagem não atrasa nem derruba a página de quem veio pelo QR Code.
 * Os headers são lidos aqui fora — dentro do `after` de um Server Component
 * eles não estão disponíveis.
 */
export async function trackChurchVisit(
  churchId: string,
  origemParam: string | string[] | undefined,
): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
    const request = {
      churchId,
      origem: parseVisitOrigin(origemParam),
      visitorKey: visitorKey(ip ?? null),
      userAgent: h.get("user-agent"),
      purpose: h.get("sec-purpose") ?? h.get("purpose"),
      nextPrefetch: h.get("next-router-prefetch"),
    };

    after(async () => {
      const service = createChurchVisitService({
        repo: createSupabaseChurchVisitRepository(getSupabaseAdminClient()),
        deduper,
      });
      await service.record(request);
    });
  } catch (err) {
    console.error("[church-visit] falha ao preparar a contagem", err);
  }
}

/** Leituras das métricas com a sessão de quem pediu (as RPCs filtram). */
export async function getVisitMetricsRepository() {
  return createSupabaseVisitMetricsRepository(await getSupabaseServerClient());
}
