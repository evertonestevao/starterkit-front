import "server-only";
import { AppError } from "@/lib/errors";
import { syncCompanySeats } from "@/server/billing";
import { getInviteService } from "@/server/invites";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getTenantService } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

/**
 * Convite para acessar o sistema — um caminho só, venha da ficha do membro,
 * do botão na lista ou da janela de edição. Confere o papel de quem convida,
 * passa pelo limite de convites e pela auditoria (inviteService) e recalcula
 * os assentos cobrados (exceder o plano não bloqueia).
 */
export async function convidarParaSistema(input: {
  companyId: string;
  email: string;
  role: "admin" | "member";
}): Promise<void> {
  const tenant = await getTenantService();
  const papel = await tenant.requireMembership(input.companyId);
  if (!permissionService.canManageMembers(papel)) {
    throw new AppError("forbidden", "Só quem administra a igreja pode convidar para o sistema.");
  }
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new AppError("unauthorized", "Sessão expirada");

  await (await getInviteService()).invite({
    companyId: input.companyId,
    email: input.email,
    role: input.role,
    invitedBy: data.user.id,
  });
  await syncCompanySeats(input.companyId);
}
