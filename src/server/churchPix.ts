import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseChurchPixRepository } from "@/repositories/supabase/churchPixRepository";
import { createAuditService } from "@/services/auditService";
import { createChurchPixService, type ChurchPixService } from "@/services/churchPixService";
import { createEmailService } from "@/services/emailService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Chave PIX da igreja. A troca é registrada em `audit_logs` e avisada por
 * email a todos os administradores — ver o porquê em churchPixService.
 */
export async function getChurchPixService(): Promise<ChurchPixService> {
  const client = await getSupabaseServerClient();
  const email = createEmailService({
    provider: getEmailProvider(),
    appUrl: getServerEnv().APP_URL,
  });

  return createChurchPixService({
    repo: createSupabaseChurchPixRepository(client),
    notifier: { sendPixChanged: (input) => email.sendPixChanged(input) },
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}
