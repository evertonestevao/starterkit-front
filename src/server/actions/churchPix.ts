"use server";

import { revalidatePath } from "next/cache";
import { createRateLimiter } from "@/server/rateLimit";
import { getChurchPixService } from "@/server/churchPix";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { AppError } from "@/lib/errors";
import { toActionError, type ActionState } from "./action-state";

/** Cada salvar ou reenviar manda e-mail ao Responsável: sem limite, vira ferramenta de spam. */
const emailLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });

/**
 * Troca da chave PIX da igreja. O formulário manda `confirmado` só no segundo
 * passo, depois de a pessoa ver na tela o que vai ser gravado — trocar a
 * chave é desviar para onde as doações vão.
 */
export async function saveChurchPixAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new AppError("unauthorized", "Faça login para continuar.");

    await emailLimiter.consume(`pix-confirmacao:${active.id}`);
    const service = await getChurchPixService();
    const { confirmacaoEnviada } = await service.savePix(
      { companyId: active.id, role: active.role, userId: auth.user.id, email: auth.user.email ?? "" },
      {
        churchId: String(formData.get("churchId") ?? ""),
        chave: String(formData.get("chave") ?? ""),
        titular: String(formData.get("titular") ?? ""),
        confirmado: formData.get("confirmado") === "true",
      },
    );

    revalidatePath("/dashboard/settings/pix");
    revalidatePath("/dashboard/tesouraria/pix");
    return {
      success: confirmacaoEnviada
        ? "Chave PIX salva. Enviamos um link ao e-mail do Responsável: a chave aparece na página assim que ele confirmar."
        : 'Chave PIX salva, mas não conseguimos enviar o e-mail de confirmação. Use "Reenviar e-mail" em instantes.',
    };
  } catch (err) {
    return toActionError(err);
  }
}

/** Manda um link de confirmação novo ao Responsável. */
export async function reenviarConfirmacaoPixAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new AppError("unauthorized", "Faça login para continuar.");

    await emailLimiter.consume(`pix-confirmacao:${active.id}`);
    const service = await getChurchPixService();
    await service.reenviarConfirmacao(
      { companyId: active.id, role: active.role, userId: auth.user.id, email: auth.user.email ?? "" },
      String(formData.get("churchId") ?? ""),
    );
    return { success: "Enviamos um link novo ao e-mail do Responsável. O anterior deixou de valer." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Confirmação pelo link do e-mail. Pública: o token é a credencial. */
export async function confirmarPixPorEmailAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getChurchPixService();
    const { churchName } = await service.confirmarPorToken(String(formData.get("token") ?? ""));
    return { success: `Chave confirmada. Ela já aparece na página de ${churchName}.` };
  } catch (err) {
    return toActionError(err);
  }
}
