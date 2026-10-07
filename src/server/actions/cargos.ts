"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getCargosService } from "@/server/cargos";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do catálogo de cargos. */

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role };
}

function dados(formData: FormData) {
  return {
    nome: String(formData.get("nome") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    unico: formData.get("unico") === "on",
    ordem: Number(formData.get("ordem") ?? 100) || 100,
  };
}

function revalidar() {
  revalidatePath("/dashboard/settings/cargos");
  revalidatePath("/dashboard/settings/lideranca");
  revalidatePath("/dashboard/membros", "layout");
}

export async function salvarCargoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const service = await getCargosService();
    const id = String(formData.get("id") ?? "");
    const valores = dados(formData);
    if (id) await service.editar(actor, id, valores);
    const cargoId = id || (await service.criar(actor, valores));
    await recordAudit({
      companyId: actor.companyId,
      action: id ? "cargo.updated" : "cargo.created",
      entityType: "cargo",
      entityId: cargoId,
      metadata: { nome: valores.nome.trim() },
    });
    revalidar();
    return { success: id ? "Cargo atualizado." : "Cargo criado. As igrejas abaixo já podem usar." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function definirCargoAtivoAction(cargoId: string, ativo: boolean): Promise<ActionState> {
  try {
    const actor = await ator();
    await (await getCargosService()).definirAtivo(actor, cargoId, ativo);
    await recordAudit({
      companyId: actor.companyId,
      action: ativo ? "cargo.reactivated" : "cargo.deactivated",
      entityType: "cargo",
      entityId: cargoId,
    });
    revalidar();
    return { success: ativo ? "Cargo reativado." : "Cargo desativado. Quem já tinha continua com ele." };
  } catch (err) {
    return toActionError(err);
  }
}
