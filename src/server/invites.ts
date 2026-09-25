import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createAuditService } from "@/services/auditService";
import { createEmailService } from "@/services/emailService";
import { createInviteService, type InviteService } from "@/services/inviteService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Um limitador só para todo convite de membro, venha da tela de Equipe ou do
 * cadastro de cargos: duas instâncias dobrariam o limite de quem alterna entre
 * as duas telas.
 */
const inviteLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

export async function getInviteService(): Promise<InviteService> {
  const client = await getSupabaseServerClient();
  return createInviteService({
    repo: createSupabaseInviteRepository(client),
    rateLimiter: inviteLimiter,
    notifier: createEmailService({
      provider: getEmailProvider(),
      appUrl: getServerEnv().APP_URL,
    }),
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}
