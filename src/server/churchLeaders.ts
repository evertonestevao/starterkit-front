import "server-only";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseChurchLeadersRepository } from "@/repositories/supabase/churchLeadersRepository";
import { createAuditService } from "@/services/auditService";
import { createChurchLeadersService, type ChurchLeadersService } from "@/services/churchLeadersService";
import { getInviteService } from "./invites";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Cargos da igreja. O convite para acessar o sistema passa pelo mesmo
 * serviço da tela de Equipe (mesmo limite, mesmo e-mail, mesma auditoria).
 */
export async function getChurchLeadersService(): Promise<ChurchLeadersService> {
  const client = await getSupabaseServerClient();
  const invites = await getInviteService();

  return createChurchLeadersService({
    repo: createSupabaseChurchLeadersRepository(client),
    inviter: async (input) => {
      await invites.invite(input);
    },
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}
