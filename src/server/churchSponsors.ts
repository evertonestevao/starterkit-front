import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createSupabasePlatformModerationRepository } from "@/repositories/supabase/platformModerationRepository";
import { createSupabaseChurchSponsorsRepository } from "@/repositories/supabase/churchSponsorsRepository";
import {
  createChurchSponsorsService,
  type ChurchSponsorsService,
} from "@/services/churchSponsorsService";
import { createEmailService } from "@/services/emailService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Patrocinadores da igreja, com o client do usuário (as RPCs checam
 * membership). O client de sistema entra só para o que NÃO é da igreja: a
 * lista de emails da moderação e a contagem de quantas outras igrejas
 * escondem o mesmo patrocinador.
 */
export async function getChurchSponsorsService(): Promise<ChurchSponsorsService> {
  const env = getServerEnv();
  const client = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });
  const staff = createSupabasePlatformModerationRepository(client, admin);

  return createChurchSponsorsService({
    repo: createSupabaseChurchSponsorsRepository(client, admin),
    appUrl: env.APP_URL,
    notifier: {
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
