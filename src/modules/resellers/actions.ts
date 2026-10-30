"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { toActionError, type ActionState } from "@/server/actions/action-state";
import { createRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createResellerAdminRepository, type ResellerAdminRepository } from "./adminRepository";
import {
  generateReferralCode,
  prepareResellerAccount,
  resendResellerInvite,
  sendResellerInviteEmail,
} from "./resellerInvite";
import {
  clientCommissionSchema,
  commissionAmountSchema,
  commissionRuleSchema,
  createResellerSchema,
  markPaidSchema,
  parseCents,
  resellerStatusSchema,
  toCommissionColumns,
  updateResellerSchema,
} from "./schemas";
import { getCommissionService } from "./server";

/**
 * Ações do painel do super admin. TODA ação passa por `asSuperAdmin`, que revalida o
 * papel no servidor: esconder a tela não protege uma server action, que é uma rota
 * pública. O teste em actions.test.ts percorre todas as exportações deste arquivo.
 */

const ADMIN_PATH = "/admin/revendedores";

const inviteLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

interface AdminContext {
  client: SupabaseClient;
  repo: ResellerAdminRepository;
  userId: string;
}

async function asSuperAdmin(run: (context: AdminContext) => Promise<ActionState>): Promise<ActionState> {
  try {
    const client = await getSupabaseServerClient();
    const { data: userData } = await client.auth.getUser();
    const { data: isSuperAdmin, error } = await client.rpc("is_super_admin");
    if (!userData.user || error || isSuperAdmin !== true) {
      throw new AppError("forbidden", "Apenas o super admin pode fazer isto");
    }
    const result = await run({ client, repo: createResellerAdminRepository(client), userId: userData.user.id });
    revalidatePath(ADMIN_PATH, "layout");
    return result;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.issues[0]?.message ?? "Dados inválidos" };
    }
    return toActionError(err);
  }
}

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function setModuleEnabledAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const enabled = formData.get("enabled") === "true";
    await repo.setModuleEnabled(enabled);
    return { success: enabled ? "Módulo ligado" : "Módulo desligado" };
  });
}

export async function createResellerAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo, userId }) => {
    const input = createResellerSchema.parse(fields(formData));
    await inviteLimiter.consume(`reseller-invite:${userId}`);

    const referralCode = input.referralCode ?? generateReferralCode(input.name);
    // Antes de criar a conta no Auth, para um duplicado não deixar usuário órfão.
    if (await repo.findConflict(input.email, referralCode)) {
      throw new AppError("conflict", "Já existe vendedor com este e-mail ou código");
    }

    const account = await prepareResellerAccount(input.email, input.name);
    await repo.insertReseller({
      name: input.name,
      email: input.email,
      referral_code: referralCode,
      user_id: account.userId,
    });

    try {
      await sendResellerInviteEmail(input.email, account.url, account.hasPassword);
    } catch (err) {
      toActionError(err);
      return { error: "Vendedor cadastrado, mas o e-mail falhou. Use Reenviar convite na página dele." };
    }
    return { success: `Convite enviado para ${input.email}` };
  });
}

export async function resendResellerInviteAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo, userId }) => {
    const id = z.uuid().parse(formData.get("id"));
    await inviteLimiter.consume(`reseller-invite:${userId}`);
    const reseller = await repo.getReseller(id);
    if (!reseller) throw new AppError("not_found", "Vendedor não encontrado");
    await resendResellerInvite(reseller.email);
    return { success: "Convite reenviado" };
  });
}

export async function updateResellerAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = updateResellerSchema.parse(fields(formData));
    await repo.updateReseller(input.id, { name: input.name, referral_code: input.referralCode });
    return { success: "Vendedor atualizado" };
  });
}

export async function setResellerStatusAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = resellerStatusSchema.parse(fields(formData));
    await repo.updateReseller(input.id, { status: input.status });
    return { success: input.status === "active" ? "Vendedor reativado" : "Vendedor suspenso" };
  });
}

export async function createCommissionRuleAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = commissionRuleSchema.parse(fields(formData));
    await repo.insertRule({
      reseller_id: input.resellerId,
      plan_id: input.planId,
      from_sale_number: input.fromSaleNumber,
      commission_type: input.commissionType,
      duration_months: input.durationMonths,
      ...toCommissionColumns(input.commissionType, input.value),
    });
    return { success: "Regra criada" };
  });
}

export async function deleteCommissionRuleAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    await repo.deleteRule(z.uuid().parse(formData.get("id")));
    return { success: "Regra removida. Clientes já vinculados não mudam." };
  });
}

export async function setPlanAvailabilityAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const available = formData.get("available") === "true";
    await repo.setPlanAvailable(z.uuid().parse(formData.get("id")), available);
    return { success: available ? "Plano liberado" : "Plano escondido" };
  });
}

export async function updateClientCommissionAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = clientCommissionSchema.parse(fields(formData));
    await repo.updateClientCommission(input.id, {
      commission_type: input.commissionType,
      duration_months: input.durationMonths,
      ...toCommissionColumns(input.commissionType, input.value),
    });
    return { success: "Comissão ajustada. Vale para os próximos lançamentos." };
  });
}

export async function updateCommissionAmountAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = commissionAmountSchema.parse(fields(formData));
    const cents = parseCents(input.amount);
    if (!(cents >= 0)) throw new AppError("validation_error", "Informe um valor em reais");
    await repo.updateCommissionAmount(input.id, cents);
    return { success: "Lançamento alterado" };
  });
}

export async function markCommissionsPaidAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const input = markPaidSchema.parse({ ids: formData.getAll("ids"), paidAt: formData.get("paidAt") });
    const count = await repo.markCommissionsPaid(input.ids, input.paidAt);
    return { success: count === 1 ? "1 lançamento marcado como pago" : `${count} lançamentos marcados como pagos` };
  });
}

export async function reprocessCommissionFailureAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async () => {
    const resolved = await getCommissionService().reprocessFailure(z.uuid().parse(formData.get("id")));
    return resolved ? { success: "Comissão reprocessada" } : { error: "A comissão falhou de novo" };
  });
}

export async function linkFromAlertAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return asSuperAdmin(async ({ repo }) => {
    const alertId = z.coerce.number().int().positive().parse(formData.get("id"));
    const linked = await repo.linkFromAlert(alertId);
    return linked
      ? { success: "Cliente vinculado. Vale a partir do próximo pagamento." }
      : { error: "Não foi possível vincular. Confira se há regra aplicável, plano liberado, vendedor ativo e módulo ligado." };
  });
}
