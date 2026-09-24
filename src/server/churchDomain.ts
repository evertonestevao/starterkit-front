import "server-only";
import { getDomainProvider } from "@/adapters/domain";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import {
  createSupabaseChurchDomainRepository,
  createSupabaseChurchDomainStatusWriter,
} from "@/repositories/supabase/churchDomainRepository";
import {
  createChurchDomainService,
  type ChurchDomainService,
  type DomainActor,
} from "@/services/churchDomainService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { createRateLimiter } from "./rateLimit";
import { getActiveTenant } from "./tenant";

/**
 * Montagem do serviço de domínio próprio.
 *
 * Leituras e reservas usam o client DO USUÁRIO (RLS valendo). Só a transição de
 * status usa service_role, e nunca por vontade do client: sempre depois de o
 * provedor confirmar posse e apontamento de DNS.
 */

/**
 * Cadastro de domínio dispara chamada externa e reserva um recurso global
 * (o host). Limite generoso para uso legítimo, apertado para automação.
 */
const claimLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });
/** "Verificar agora" é barato, mas bate na API da Vercel — que tem limite. */
const verifyLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

async function buildService(rateLimiter = claimLimiter): Promise<ChurchDomainService> {
  const client = await getSupabaseServerClient();
  return createChurchDomainService({
    repo: createSupabaseChurchDomainRepository(client),
    statusWriter: createSupabaseChurchDomainStatusWriter(getSupabaseAdminClient()),
    provider: getDomainProvider(),
    appUrl: getServerEnv().APP_URL,
    rateLimiter,
  });
}

export async function getChurchDomainService(): Promise<ChurchDomainService> {
  return buildService();
}

export async function getChurchDomainVerifyService(): Promise<ChurchDomainService> {
  return buildService(verifyLimiter);
}

/**
 * Ator do request: empresa ativa + papel. Sai daqui (e não do formulário) para
 * que nenhum campo enviado pelo client possa trocar a empresa da operação.
 */
export async function getDomainActor(): Promise<DomainActor> {
  const { active } = await getActiveTenant();
  if (!active) {
    throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  }
  return { companyId: active.id, role: active.role };
}

/**
 * Serviço do job de verificação: roda sem usuário logado, então repo e writer
 * usam o mesmo client service_role. Só é alcançável pelo route handler do cron,
 * protegido por CRON_SECRET.
 */
export function getChurchDomainSweepService(): ChurchDomainService {
  const admin = getSupabaseAdminClient();
  return createChurchDomainService({
    repo: createSupabaseChurchDomainRepository(admin),
    statusWriter: createSupabaseChurchDomainStatusWriter(admin),
    provider: getDomainProvider(),
    appUrl: getServerEnv().APP_URL,
  });
}
