"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeChurchLinkPath, tokenDoCaminho } from "@/lib/churchLinks";
import { getChurchLinkService } from "@/server/churchLinks";
import { AppError } from "@/lib/errors";
import { MODULOS_DESLIGAVEIS } from "@/lib/menuPermissoes";
import { recordAudit } from "@/server/audit";
import { syncCompanySeats } from "@/server/billing";
import { getRequestEvidence, getTermsService } from "@/server/terms";
import { getInviteService } from "@/server/invites";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { ACTIVE_COMPANY_COOKIE, getTenantService } from "@/server/tenant";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { createEmailService } from "@/services/emailService";
import { linkDeAceite } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";
import type { RoleCode } from "@/types/database";
import { convidarParaSistema } from "@/server/conviteSistema";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de empresas, membros e convites. */

async function setActiveCompanyCookie(companyId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createCompanyAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  let companyId: string;
  try {
    // Gate de termos no onboarding: sem aceite da versão vigente, a empresa
    // não é criada (o checkbox required do form é só UX; a verdade é aqui).
    const terms = await getTermsService();
    if (!(await terms.hasAcceptedCurrent("igreja"))) {
      if (formData.get("accept_terms") !== "on") {
        throw new AppError("validation_error", "Você precisa aceitar os termos de uso para continuar");
      }
      const evidence = await getRequestEvidence();
      await terms.acceptCurrentTerms("igreja", evidence);
      await terms.setConsent("email_communications", formData.get("email_consent") === "on", evidence);
    }

    const tenant = await getTenantService();
    // Checkbox marcado = módulo continua ativo; o que NÃO veio marcado é o
    // que entra como desligado (o form já manda todos marcados por padrão).
    const modulosInativos = MODULOS_DESLIGAVEIS.filter((m) => formData.get(`modulo_${m}`) !== "on");
    const company = await tenant.createCompany({
      name: formData.get("name"),
      sobrenome: formData.get("sobrenome"),
      fazParteDeRede: formData.get("faz_parte_de_rede") === "on",
      redeNome: formData.get("rede_nome"),
      modulosInativos,
    });
    companyId = company.id;
    await setActiveCompanyCookie(companyId);
  } catch (err) {
    return toActionError(err);
  }
  // Quem chegou por um link de vínculo volta a ele (só esse caminho é aceito),
  // já com o pedido feito.
  const voltar = safeChurchLinkPath(formData.get("next"));
  if (voltar) await pedirVinculoDoConvite(companyId, voltar);
  redirect(voltar ?? "/dashboard");
}

/**
 * Igreja criada a partir de um link de vínculo: o pedido sai sozinho, sem
 * outro clique. Falhar aqui não desfaz a igreja — a página do link mostra o
 * botão de pedir, como antes.
 */
async function pedirVinculoDoConvite(companyId: string, caminho: string): Promise<void> {
  const token = tokenDoCaminho(caminho);
  if (!token) return;
  try {
    const { data } = await (await getSupabaseServerClient()).auth.getUser();
    if (!data.user) return;
    const actor = { companyId, role: "owner" as RoleCode, userId: data.user.id };
    const links = await getChurchLinkService();
    const [igreja] = await links.listChurches(actor);
    if (igreja) await links.requestLink(actor, { token, churchId: igreja.id });
  } catch (err) {
    console.error("[onboarding] não foi possível pedir o vínculo sozinho", err);
  }
}

// Nota: actions chamadas imperativamente (fora de <form action>) NÃO usam
// redirect() aqui — o redirect do Next viaja como exceção e cai no catch do
// client como se fosse erro. Elas retornam ActionState e o client navega.
export async function switchCompanyAction(companyId: string): Promise<ActionState | void> {
  try {
    // Valida membership antes de gravar a preferência.
    const tenant = await getTenantService();
    await tenant.requireMembership(companyId);
    await setActiveCompanyCookie(companyId);
    revalidatePath("/dashboard", "layout");
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateCompanyAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
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
    return { success: "Igreja atualizada" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function inviteMemberAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    await convidarParaSistema({
      companyId,
      email: String(formData.get("email") ?? ""),
      role: formData.get("role") === "admin" ? "admin" : "member",
    });
    revalidatePath("/dashboard/membros", "layout");
    revalidatePath("/dashboard/settings/quem-acessa");
    return { success: "Convite enviado" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeInviteAction(inviteId: string, companyId: string): Promise<ActionState | void> {
  try {
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
    revalidatePath("/dashboard/membros", "layout");
    revalidatePath("/dashboard/settings/quem-acessa");
  } catch (err) {
    // Erro (incl. falha de auditoria, que desfaz a action) vira mensagem
    // segura para o client exibir — nunca falha silenciosa.
    return toActionError(err);
  }
}

/** Quem administra a igreja e está logado; devolve o id de quem age. */
async function exigeGestaoDeConvites(companyId: string): Promise<string> {
  const tenant = await getTenantService();
  const role = await tenant.requireMembership(companyId);
  if (!permissionService.canManageMembers(role)) {
    throw new AppError("forbidden", "Só quem administra a igreja gerencia os convites.");
  }
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new AppError("unauthorized", "Sessão expirada");
  return data.user.id;
}

/** Manda de novo o e-mail de um convite pendente. */
export async function reenviarConviteAction(inviteId: string, companyId: string): Promise<ActionState> {
  try {
    const quem = await exigeGestaoDeConvites(companyId);
    const convite = await (await getInviteService()).resend(inviteId, companyId, quem);
    return { success: `E-mail reenviado para ${convite.email}.` };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Link de aceite de um convite pendente, para mandar por outro canal
 * (WhatsApp) quando o e-mail não chega. Só quem administra a igreja.
 */
export async function linkDoConviteAction(
  inviteId: string,
  companyId: string,
): Promise<ActionState & { url?: string; email?: string }> {
  try {
    await exigeGestaoDeConvites(companyId);
    const { token, email } = await (await getInviteService()).tokenDoConvite(inviteId, companyId);
    return { url: linkDeAceite(getServerEnv().APP_URL, token), email };
  } catch (err) {
    return toActionError(err);
  }
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
): Promise<ActionState | void> {
  try {
    const tenant = await getTenantService();
    const { previousRole } = await tenant.changeMemberRole(companyId, memberId, newRole);
    await recordAudit({
      companyId,
      action: "member.role_changed",
      entityType: "company_member",
      entityId: memberId,
      metadata: { previous_role: previousRole, new_role: newRole },
    });
    revalidatePath("/dashboard/membros", "layout");
    revalidatePath("/dashboard/settings/quem-acessa");
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Dá ou tira o papel de Responsável. A auditoria é gravada pelo banco, junto
 * com a mudança; aqui só o aviso por e-mail, que não desfaz nada se falhar.
 */
export async function definirResponsavelAction(
  companyId: string,
  memberId: string,
  tornar: boolean,
  nomeDaPessoa: string,
): Promise<ActionState | void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new AppError("unauthorized", "Faça login para continuar.");

    const tenant = await getTenantService();
    const { avisar } = await tenant.definirResponsavel(companyId, memberId, tornar);

    const igreja = (await tenant.listMyCompanies()).find((c) => c.id === companyId);
    await createEmailService({ provider: getEmailProvider(), appUrl: getServerEnv().APP_URL })
      .sendResponsavelChanged({
        to: [...new Set(avisar.map((a) => a.email))],
        churchName: igreja?.name ?? "sua igreja",
        pessoa:
          String(nomeDaPessoa ?? "")
            .trim()
            .slice(0, 120) || "Uma pessoa",
        tornou: tornar,
        alteradoPor: auth.user.email ?? "um Responsável",
      })
      .catch((err) => console.error("[responsavel] falha ao avisar por e-mail", err));

    revalidatePath("/dashboard", "layout");
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeMemberAction(companyId: string, memberId: string): Promise<ActionState | void> {
  try {
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
    revalidatePath("/dashboard/membros", "layout");
    revalidatePath("/dashboard/settings/quem-acessa");
  } catch (err) {
    return toActionError(err);
  }
}

export async function leaveCompanyAction(companyId: string): Promise<ActionState | void> {
  try {
    const tenant = await getTenantService();
    // Auditar ANTES de sair: depois da saída a RLS já não deixa inserir.
    await recordAudit({ companyId, action: "member.left", entityType: "company_member" });
    await tenant.leaveCompany(companyId);
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_COMPANY_COOKIE);
  } catch (err) {
    return toActionError(err);
  }
  // navegação fica no client (ver nota em switchCompanyAction)
}
