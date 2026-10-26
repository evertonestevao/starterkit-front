import "server-only";
import {
  createSupabaseAccountRemover,
  createSupabaseAccountRepository,
} from "@/repositories/supabase/accountRepository";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createAccountService, type AccountService } from "@/services/accountService";
import { createAuditService } from "@/services/auditService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/** Exportação e exclusão são raras: limite baixo contra abuso e scraping. */
const accountLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

/**
 * Service de conta: leitura e auditoria com o client do usuário (RLS ativa);
 * só a exclusão definitiva usa service_role.
 */
export async function getAccountService(): Promise<AccountService> {
  const client = await getSupabaseServerClient();
  const audit = createAuditService(createSupabaseAuditRepository(client));
  return createAccountService({
    repo: createSupabaseAccountRepository(client),
    // Lazy: o client service_role só é criado se a exclusão chegar até aqui.
    remover: {
      deleteUser: (userId) =>
        createSupabaseAccountRemover(getSupabaseAdminClient()).deleteUser(userId),
    },
    audit: {
      record: ({ companyId, userId, action }) =>
        audit.record({
          companyId,
          userId,
          action,
          entityType: "user",
          entityId: userId,
          metadata: {},
        }),
    },
    rateLimiter: accountLimiter,
  });
}
