import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createSupabasePlatformModerationRepository } from "@/repositories/supabase/platformModerationRepository";
import { createEmailService } from "@/services/emailService";
import {
  createPlatformModerationService,
  type PlatformModerationService,
} from "@/services/platformModerationService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Área da plataforma (moderação).
 *
 * `is_platform_staff()` é a fonte da verdade e é checada DE NOVO dentro de
 * cada RPC — a checagem daqui serve para a UI não oferecer o que não pode, e
 * não como barreira. A barreira está no banco.
 */
export async function isPlatformStaff(): Promise<boolean> {
  const client = await getSupabaseServerClient();
  const { data, error } = await client.rpc("is_platform_staff");
  if (error) return false;
  return Boolean(data);
}

/** Usada nas server actions: falha fechada. */
export async function requirePlatformStaff(): Promise<void> {
  if (!(await isPlatformStaff())) {
    throw new AppError("forbidden", "Esta área é da moderação da plataforma.");
  }
}

export async function getPlatformModerationService(): Promise<PlatformModerationService> {
  const env = getServerEnv();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });
  const client = await getSupabaseServerClient();

  return createPlatformModerationService({
    repo: createSupabasePlatformModerationRepository(client, getSupabaseAdminClient()),
    notifier: {
      sendProfileDecision: (input) => email.sendSponsorProfileDecision(input),
    },
  });
}
