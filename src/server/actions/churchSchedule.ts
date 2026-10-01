"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getChurchScheduleService } from "@/server/churchSchedule";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da programação (cultos semanais e especiais). */

const PAGINA = "/dashboard/programacao";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role };
}

export async function addScheduleItemAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const titulo = texto(formData, "titulo");
    const id = await (await getChurchScheduleService()).addItem(actor, {
      churchId: texto(formData, "churchId"),
      titulo,
      tipo: texto(formData, "tipo"),
      diaSemana: texto(formData, "diaSemana"),
      data: texto(formData, "data"),
      hora: texto(formData, "hora"),
      descricao: texto(formData, "descricao"),
      local: texto(formData, "local"),
      // Checkbox desmarcado não vai no form; o campo escondido diz que ele existia.
      registraChamada: formData.get("registraChamada") === "on",
    });
    await recordAudit({
      companyId: actor.companyId,
      action: "church_schedule.added",
      entityType: "church_schedule",
      entityId: id,
      metadata: { titulo: titulo.trim() },
    });
    revalidatePath(PAGINA);
    revalidatePath("/dashboard/acompanhamento", "layout");
    return { success: `“${titulo.trim()}” entrou na programação.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeScheduleItemAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const id = texto(formData, "itemId");
    await (await getChurchScheduleService()).removeItem(actor, id);
    await recordAudit({
      companyId: actor.companyId,
      action: "church_schedule.removed",
      entityType: "church_schedule",
      entityId: id,
    });
    revalidatePath(PAGINA);
    revalidatePath("/dashboard/acompanhamento", "layout");
    return { success: "Removido da programação." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Edita um item da programação. A igreja do item não muda. */
export async function updateScheduleItemAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const itemId = texto(formData, "itemId");
    const titulo = texto(formData, "titulo");
    await (await getChurchScheduleService()).updateItem(actor, {
      itemId,
      titulo,
      tipo: texto(formData, "tipo"),
      diaSemana: texto(formData, "diaSemana"),
      data: texto(formData, "data"),
      hora: texto(formData, "hora"),
      descricao: texto(formData, "descricao"),
      local: texto(formData, "local"),
      // Checkbox desmarcado não vai no form; o campo escondido diz que ele existia.
      registraChamada: formData.get("registraChamada") === "on",
    });
    await recordAudit({
      companyId: actor.companyId,
      action: "church_schedule.updated",
      entityType: "church_schedule",
      entityId: itemId,
      metadata: { titulo: titulo.trim() },
    });
    revalidatePath(PAGINA);
    revalidatePath("/dashboard/acompanhamento", "layout");
    return { success: `“${titulo.trim()}” foi atualizado.` };
  } catch (err) {
    return toActionError(err);
  }
}
