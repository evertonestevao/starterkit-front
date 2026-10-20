import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createSupabaseChurchLinkRepository } from "@/repositories/supabase/churchLinkRepository";
import { createEmailService } from "@/services/emailService";
import { createChurchLinkService, type ChurchLinkService } from "@/services/churchLinkService";
import { createMemoryRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { hashUrlToken, makeUrlToken } from "./tokens";

/**
 * Dez links por hora por pessoa. Fica no módulo (e não dentro da função) para o
 * contador sobreviver entre requests da mesma instância.
 */
const linkRateLimiter = createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/**
 * Vínculo entre igrejas. As leituras e as funções de árvore usam o client do
 * USUÁRIO (a autorização é do banco); o `service_role` entra só para ler o
 * e-mail de quem administra a outra igreja, que quem age não enxerga.
 */
export async function getChurchLinkService(): Promise<ChurchLinkService> {
  const env = getServerEnv();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });
  return createChurchLinkService({
    repo: createSupabaseChurchLinkRepository(await getSupabaseServerClient(), getSupabaseAdminClient()),
    rateLimiter: linkRateLimiter,
    makeToken: makeUrlToken,
    hashToken: hashUrlToken,
    appUrl: env.APP_URL,
    notifier: {
      requested: (input) => email.sendChurchLinkRequested(input),
      decided: (input) => email.sendChurchLinkDecided(input),
      moved: (input) => email.sendChurchLinkMoved(input),
      ended: (input) => email.sendChurchLinkEnded(input),
    },
  });
}
