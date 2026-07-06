"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/config/env";
import { getEmailProvider } from "@/adapters/email";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { syncCompanySeats } from "@/server/billing";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { ACTIVE_COMPANY_COOKIE, getTenantService } from "@/server/tenant";
import { createAuditService } from "@/services/auditService";
import { createEmailService } from "@/services/emailService";
import { createInviteService } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";
import type { RoleCode } from "@/types/database";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de empresas, membros e convites. */

const inviteLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

async function setActiveCompanyCookie(companyId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createCompanyAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let companyId: string;
  try {
    const tenant = await getTenantService();
    const company = await tenant.createCompany({ name: formData.get("name") });
    companyId = company.id;
    await setActiveCompanyCookie(companyId);
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}

export async function switchCompanyAction(companyId: string): Promise<void> {
  // Valida membership antes de gravar a preferência.
  const tenant = await getTenantService();
  await tenant.requireMembership(companyId);
  await setActiveCompanyCookie(companyId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function updateCompanyAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const tenant = await getTenantService();
    await tenant.updateCompany(companyId, { name: formData.get("name") });
    await recordAudit({
      companyId,
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      metadata: { name: String(formData.get("name") ?? "") },
    });
    revalidatePath("/dashboard", "layout");
    return { success: "Empresa atualizada" };
  } catch (err) {
    return toActionError(err);
  }
}

async function getInviteService() {
  const client = await getSupabaseServerClient();
  return createInviteService({
    repo: createSupabaseInviteRepository(client),
    rateLimiter: inviteLimiter,
    notifier: createEmailService({
      provider: getEmailProvider(),
      appUrl: getServerEnv().APP_URL,
    }),
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}

export async function inviteMemberAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const tenant = await getTenantService();
    const role = await tenant.requireMembership(companyId);
    if (!permissionService.canManageMembers(role)) {
      throw new AppError("forbidden", "Sem permissão para convidar membros");
    }
    const client = await getSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    const invites = await getInviteService();
    await invites.invite({
      companyId,
      email: String(formData.get("email") ?? ""),
      role: formData.get("role") === "admin" ? "admin" : "member",
      invitedBy: data.user.id,
    });
    // Billing por seat: exceder o plano não bloqueia o convite — recalcula
    // os extras e ajusta a cobrança no gateway.
    await syncCompanySeats(companyId);
    revalidatePath("/dashboard/members");
    return { success: "Convite enviado" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeInviteAction(inviteId: string, companyId: string): Promise<void> {
  const tenant = await getTenantService();
  const role = await tenant.requireMembership(companyId);
  if (!permissionService.canManageMembers(role)) {
    throw new AppError("forbidden", "Sem permissão para revogar convites");
  }
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  const invites = await getInviteService();
  await invites.revoke(inviteId, companyId, data.user?.id ?? "");
  await syncCompanySeats(companyId);
  revalidatePath("/dashboard/members");
}

export async function acceptInviteAction(token: string): Promise<{ error?: string }> {
  try {
    const invites = await getInviteService();
    const member = await invites.accept(token);
    await setActiveCompanyCookie(member.company_id);
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}

export async function changeMemberRoleAction(
  companyId: string,
  memberId: string,
  newRole: RoleCode,
): Promise<void> {
  const tenant = await getTenantService();
  const { previousRole } = await tenant.changeMemberRole(companyId, memberId, newRole);
  await recordAudit({
    companyId,
    action: "member.role_changed",
    entityType: "company_member",
    entityId: memberId,
    metadata: { previous_role: previousRole, new_role: newRole },
  });
  revalidatePath("/dashboard/members");
}

export async function removeMemberAction(companyId: string, memberId: string): Promise<void> {
  const tenant = await getTenantService();
  const { removedRole } = await tenant.removeMember(companyId, memberId);
  await recordAudit({
    companyId,
    action: "member.removed",
    entityType: "company_member",
    entityId: memberId,
    metadata: { removed_role: removedRole },
  });
  await syncCompanySeats(companyId);
  revalidatePath("/dashboard/members");
}

export async function leaveCompanyAction(companyId: string): Promise<void> {
  const tenant = await getTenantService();
  // Auditar ANTES de sair: depois da saída a RLS já não deixa inserir.
  await recordAudit({ companyId, action: "member.left", entityType: "company_member" });
  await tenant.leaveCompany(companyId);
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);
  redirect("/onboarding");
}
