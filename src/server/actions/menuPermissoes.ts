"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { MODULOS_LIBERAVEIS } from "@/lib/menuPermissoes";
import { recordAudit } from "@/server/audit";
import { getMenuPermissoesService } from "@/server/menuPermissoes";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de Configurações → Acessos (módulos liberados por cargo). */

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role };
}

async function gravar(desejado: Array<{ cargoId: string; modulo: string; permitido: boolean }>, action: string) {
  const actor = await ator();
  const excecoes = await (await getMenuPermissoesService()).salvar(actor, desejado);
  await recordAudit({
    companyId: actor.companyId,
    action,
    entityType: "cargo_acessos",
    entityId: actor.companyId,
    metadata: { excecoes },
  });
  // O menu e as telas de todo mundo desta igreja dependem disto.
  revalidatePath("/dashboard", "layout");
}

export async function salvarAcessosAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    // Caixa desmarcada não vem no form: percorre os cargos mostrados × módulos.
    // (O service confere de novo quais cargos a igreja realmente usa.)
    const cargos = formData.getAll("cargo").map(String);
    const desejado = cargos.flatMap((cargoId) =>
      MODULOS_LIBERAVEIS.map((modulo) => ({
        cargoId,
        modulo,
        permitido: formData.get(`c:${cargoId}:${modulo}`) === "on",
      })),
    );
    await gravar(desejado, "acessos.updated");
    return { success: "Acessos salvos. Já valem para quem tem esses cargos." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Apaga as escolhas desta igreja: volta ao herdado (ou a nada liberado). */
export async function restaurarAcessosAction(): Promise<ActionState> {
  try {
    await gravar([], "acessos.restored");
    return { success: "Acessos restaurados." };
  } catch (err) {
    return toActionError(err);
  }
}
