import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseChurchPixRepository } from "@/repositories/supabase/churchPixRepository";
import { createAuditService } from "@/services/auditService";
import { createChurchPixService, type ChurchPixService } from "@/services/churchPixService";
import { createEmailService } from "@/services/emailService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { hashUrlToken, makeUrlToken } from "./tokens";

/**
 * Chave PIX da igreja. A troca é registrada em `audit_logs`, avisada por
 * email a todos os administradores e só vai para a página depois que o
 * Responsável confirma pelo link — ver o porquê em churchPixService.
 *
 * O client com `service_role` entra só para gravar o pedido de confirmação.
 */
export async function getChurchPixService(): Promise<ChurchPixService> {
  const client = await getSupabaseServerClient();
  const email = createEmailService({
    provider: getEmailProvider(),
    appUrl: getServerEnv().APP_URL,
  });

  return createChurchPixService({
    repo: createSupabaseChurchPixRepository(client, getSupabaseAdminClient()),
    notifier: {
      sendPixChanged: (input) => email.sendPixChanged(input),
      sendPixConfirmation: (input) => email.sendPixConfirmation(input),
    },
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}
