import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { getServerEnv } from "@/config/env";
import { createSupabasePlatformModerationRepository } from "@/repositories/supabase/platformModerationRepository";
import { createSupabaseSponsorProfileRepository } from "@/repositories/supabase/sponsorProfileRepository";
import { createEmailService } from "@/services/emailService";
import {
  createSponsorProfileService,
  type SponsorProfileService,
} from "@/services/sponsorProfileService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { hashUrlToken, makeUrlToken } from "./tokens";

export const SPONSOR_LOGOS_BUCKET = "sponsor-logos";

/**
 * Montagem do serviço de perfil do patrocinador.
 *
 * O aviso para a moderação sai daqui com `service_role` porque `platform_staff`
 * não tem GRANT para `authenticated` — o patrocinador não pode descobrir quem
 * modera a plataforma.
 */
async function build(): Promise<SponsorProfileService> {
  const env = getServerEnv();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });
  const client = await getSupabaseServerClient();
  const staff = createSupabasePlatformModerationRepository(client, getSupabaseAdminClient());

  // Upload com o client do USUÁRIO: a policy do bucket é que garante que ele
  // só escreve na pasta `pendente/<uid>` dele. Com service_role aqui, um bug
  // de path bastaria para escrever direto na pasta pública e pular a fila.
  const logos = createSupabaseStorageProvider(client, SPONSOR_LOGOS_BUCKET);

  return createSponsorProfileService({
    repo: createSupabaseSponsorProfileRepository(client),
    storage: {
      upload: ({ path, bytes, contentType }) =>
        logos.upload({ path, content: bytes, contentType }).then(() => undefined),
      publicUrl: (path) => logos.getPublicUrl(path),
    },
    appUrl: env.APP_URL,
    makeToken: makeUrlToken,
    hashToken: hashUrlToken,
    notifier: {
      sendChangeRequested: (input) => email.sendSponsorProfileChangeRequested(input),
      async sendStaffAlert({ subject, lines }) {
        await email.sendPlatformStaffAlert({
          to: await staff.listStaffEmails(),
          subject,
          lines,
        });
      },
    },
  });
}

/** Perfil do patrocinador logado. */
export function getSponsorProfileService(): Promise<SponsorProfileService> {
  return build();
}

/**
 * Serviço do link "não fui eu": chega SEM sessão. A RPC de cancelamento tem
 * execute para `anon` justamente por isso — quem prova ser o dono é quem tem
 * o token do email.
 */
export function getPublicSponsorProfileService(): Promise<SponsorProfileService> {
  return build();
}
