"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { MODULOS_DESLIGAVEIS } from "@/lib/menuPermissoes";
import { recordAudit } from "@/server/audit";
import { getModuloAtivoService } from "@/server/moduloAtivo";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de Configurações → Acessos (módulos ativos por igreja). */

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role };
}

async function gravar(desejado: Array<{ modulo: string; ativo: boolean }>, action: string) {
  const actor = await ator();
  const excecoes = await (await getModuloAtivoService()).salvar(actor, desejado);
  await recordAudit({
    companyId: actor.companyId,
    action,
    entityType: "church_modulos",
    entityId: actor.companyId,
    metadata: { excecoes },
  });
  // O menu e as telas de todo mundo desta igreja dependem disto.
  revalidatePath("/dashboard", "layout");
}

export async function salvarModulosAtivosAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    // Caixa desmarcada não vem no form: desligada.
    const desejado = MODULOS_DESLIGAVEIS.map((modulo) => ({
      modulo,
      ativo: formData.get(`modulo_${modulo}`) === "on",
    }));
    await gravar(desejado, "modulos_ativos.updated");
    return { success: "Módulos salvos. Já valem para esta igreja." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Apaga as escolhas desta igreja: volta ao herdado (ou tudo ativo). */
export async function restaurarModulosAtivosAction(): Promise<ActionState> {
  try {
    await gravar([], "modulos_ativos.restored");
    return { success: "Módulos restaurados." };
  } catch (err) {
    return toActionError(err);
  }
}
