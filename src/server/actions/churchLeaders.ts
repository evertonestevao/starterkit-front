"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { syncCompanySeats } from "@/server/billing";
import { getChurchLeadersService } from "@/server/churchLeaders";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

async function actorDaEmpresaAtiva() {
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new AppError("unauthorized", "Faça login para continuar.");

  return { companyId: active.id, role: active.role, userId: auth.user.id };
}

/** Registra quem ocupa um cargo e, se pedido, já convida a pessoa para o sistema. */
export async function addChurchLeaderAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await actorDaEmpresaAtiva();
    const { invited } = await (await getChurchLeadersService()).addLeader(actor, {
      churchId: String(formData.get("churchId") ?? ""),
      cargo: String(formData.get("cargo") ?? ""),
      nome: String(formData.get("nome") ?? ""),
      email: String(formData.get("email") ?? ""),
      telefone: String(formData.get("telefone") ?? ""),
      convidarComo: String(formData.get("convidarComo") ?? ""),
    });

    // Convidar exceder o plano não bloqueia: recalcula os assentos extras,
    // igual ao convite da tela de Equipe.
    if (invited) await syncCompanySeats(actor.companyId);

    revalidatePath("/dashboard/settings/cargos");
    revalidatePath("/dashboard/settings/vinculos");
    return { success: invited ? "Cargo registrado e convite enviado." : "Cargo registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Tira a pessoa do cargo (fica no histórico). Chamada fora de <form>: devolve o estado, sem redirect. */
export async function removeChurchLeaderAction(churchId: string, leaderId: string): Promise<ActionState> {
  try {
    const actor = await actorDaEmpresaAtiva();
    await (await getChurchLeadersService()).removeLeader(actor, { churchId, leaderId });
    revalidatePath("/dashboard/settings/cargos");
    revalidatePath("/dashboard/settings/vinculos");
    return { success: "Pessoa removida do cargo." };
  } catch (err) {
    return toActionError(err);
  }
}
