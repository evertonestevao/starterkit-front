"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { NIVEIS } from "@/lib/niveisRede";
import { recordAudit } from "@/server/audit";
import { getNiveisRedeService } from "@/server/niveisRede";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** A igreja do formulário, conferida contra a empresa ativa (nunca confia no id que veio da tela). */
async function contexto(churchId: string) {
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  const service = await getNiveisRedeService();
  const igreja = await service.igrejaDaEmpresa(active.id, churchId);
  if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");
  return { active, service, igreja };
}

/** Grava os nomes que a rede dá aos três níveis. Só o Responsável da sede. */
export async function salvarNomesNiveisAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const { active, service, igreja } = await contexto(String(formData.get("churchId") ?? ""));
    const nomes = await service.salvar(
      { role: active.role },
      igreja,
      Object.fromEntries(
        NIVEIS.map((n) => [
          n,
          { singular: String(formData.get(`${n}_singular`) ?? ""), plural: String(formData.get(`${n}_plural`) ?? "") },
        ]),
      ),
    );
    await recordAudit({
      companyId: active.id,
      action: "rede.niveis_renomeados",
      entityType: "church",
      entityId: igreja.id,
      metadata: Object.fromEntries(NIVEIS.map((n) => [n, nomes[n].singular])),
    });
    revalidatePath("/dashboard", "layout");
    return { success: "Nomes dos níveis salvos. Valem para toda a rede." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Devolve a rede aos nomes padrão (Sede, Subsede, Congregação). */
export async function restaurarNomesNiveisAction(churchId: string): Promise<ActionState> {
  try {
    const { active, service, igreja } = await contexto(churchId);
    await service.restaurarPadrao({ role: active.role }, igreja);
    await recordAudit({
      companyId: active.id,
      action: "rede.niveis_padrao",
      entityType: "church",
      entityId: igreja.id,
    });
    revalidatePath("/dashboard", "layout");
    return { success: "Nomes padrão restaurados." };
  } catch (err) {
    return toActionError(err);
  }
}
