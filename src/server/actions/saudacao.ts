"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getSaudacaoService } from "@/server/saudacao";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Troca a saudação das mensagens prontas da igreja (vazio volta ao padrão). */
export async function salvarSaudacaoAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
    const churchId = String(formData.get("churchId") ?? "");
    const saudacao = await (await getSaudacaoService()).salvar(
      { companyId: active.id, role: active.role },
      churchId,
      String(formData.get("saudacao") ?? ""),
    );
    await recordAudit({
      companyId: active.id,
      action: "church.saudacao_updated",
      entityType: "church",
      entityId: churchId,
      metadata: { saudacao },
    });
    revalidatePath("/dashboard", "layout");
    return { success: `Saudação salva: "${saudacao}!"` };
  } catch (err) {
    return toActionError(err);
  }
}
