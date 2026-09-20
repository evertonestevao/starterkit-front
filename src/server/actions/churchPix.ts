"use server";

import { revalidatePath } from "next/cache";
import { getChurchPixService } from "@/server/churchPix";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { AppError } from "@/lib/errors";
import { toActionError, type ActionState } from "./action-state";

/**
 * Troca da chave PIX da igreja. O formulário manda `confirmado` só no segundo
 * passo, depois de a pessoa ver na tela o que vai ser gravado — trocar a
 * chave é desviar para onde as doações vão.
 */
export async function saveChurchPixAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new AppError("unauthorized", "Faça login para continuar.");

    const service = await getChurchPixService();
    await service.savePix(
      { companyId: active.id, role: active.role, userId: auth.user.id, email: auth.user.email ?? "" },
      {
        churchId: String(formData.get("churchId") ?? ""),
        chave: String(formData.get("chave") ?? ""),
        titular: String(formData.get("titular") ?? ""),
        confirmado: formData.get("confirmado") === "true",
      },
    );

    revalidatePath("/dashboard/settings/pix");
    return { success: "Chave PIX salva. Avisamos os administradores por email." };
  } catch (err) {
    return toActionError(err);
  }
}
