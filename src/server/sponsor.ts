import "server-only";
import { getDefaultRecurringBillingProviderName, getRecurringBillingProvider } from "@/adapters/payment";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import {
  createSupabaseSponsorBillingStore,
  createSupabaseSponsorRepository,
} from "@/repositories/supabase/sponsorRepository";
import { createAuditService } from "@/services/auditService";
import { createEmailService } from "@/services/emailService";
import {
  createSponsorService,
  type Actor,
  type SponsorAuditEntry,
  type SponsorService,
} from "@/services/sponsorService";
import { createRateLimiter } from "./rateLimit";
import { getSponsorIdentityProvider } from "./sponsorIdentity";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Montagem do serviço de patrocínio.
 *
 * O patrocinador não é membro da igreja, então o registro na auditoria DELA
 * (patrocínio iniciado/cancelado) é feito com service_role — mesmo padrão do
 * webhook de pagamento.
 */

async function auditToChurch(entry: SponsorAuditEntry): Promise<void> {
  const admin = getSupabaseAdminClient();
  await createAuditService(createSupabaseAuditRepository(admin)).record({
    companyId: entry.companyId,
    userId: entry.userId,
    action: entry.action,
    entityType: "sponsorship",
    entityId: entry.sponsorshipId,
    metadata: entry.metadata ?? {},
  });
}

/**
 * Limite do endereço PÚBLICO de assinatura: ele cria cliente no gateway e
 * dispara email sem exigir login. Por email e por IP.
 */
const publicSponsorshipLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

/**
 * Único ponto de leitura da mensalidade de uma igreja: o valor que a
 * plataforma combinou com ela, ou o padrão (quem resolve é o banco).
 */
async function getAutopatrocinioAmountCents(
  client: Parameters<typeof createSupabaseSponsorRepository>[0],
  churchId: string | null,
): Promise<number> {
  const { data, error } = churchId
    ? await client.rpc("mensalidade_da_igreja", { p_church_id: churchId })
    : await client.rpc("get_autopatrocinio_amount_cents");
  if (error || data === null) {
    throw new AppError("internal_error", "Falha ao carregar o valor do autopatrocínio", error);
  }
  return data as number;
}

function build(repoClient: Parameters<typeof createSupabaseSponsorRepository>[0]): SponsorService {
  const env = getServerEnv();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });

  return createSponsorService({
    repo: createSupabaseSponsorRepository(repoClient),
    store: createSupabaseSponsorBillingStore(getSupabaseAdminClient()),
    resolveProvider: getRecurringBillingProvider,
    defaultProviderName: getDefaultRecurringBillingProviderName,
    appUrl: env.APP_URL,
    audit: auditToChurch,
    identity: getSponsorIdentityProvider(),
    mailer: {
      sendAccessLink: (input) => email.sendSponsorAccessLink(input),
    },
    publicRateLimiter: publicSponsorshipLimiter,
    getAutopatrocinioAmountCents: (churchId) => getAutopatrocinioAmountCents(repoClient, churchId),
  });
}

/**
 * Serviço da página PÚBLICA de convite: não há sessão, então o repo recebe o
 * client de sistema. Só `getInviteData` e `startPublicSponsorship` devem ser
 * chamados por aqui.
 */
export function getPublicSponsorService(): SponsorService {
  return build(getSupabaseAdminClient());
}

/** Serviço para requests do patrocinador logado. */
export async function getSponsorService(): Promise<SponsorService> {
  return build(await getSupabaseServerClient());
}

/**
 * Serviço para webhook e job: sem sessão de usuário. Os métodos "do
 * patrocinador" (getOverview etc.) não devem ser chamados por aqui.
 */
export function getSponsorSystemService(): SponsorService {
  return build(getSupabaseAdminClient());
}

/** Usuário logado; o e-mail vem da conta de login, nunca do formulário. */
export async function getSponsorActor(): Promise<Actor> {
  const client = await getSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new AppError("unauthorized", "Entre na sua conta para continuar.");
  }
  return { userId: data.user.id, email: data.user.email };
}
