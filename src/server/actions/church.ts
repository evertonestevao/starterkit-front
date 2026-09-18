"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getPublicSubmissionService } from "@/server/publicSubmission";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

async function getChurchClient() {
  const supabase = await getSupabaseServerClient();
  return supabase;
}

/**
 * Formulários da página pública da igreja. Devolvem ActionState em vez de
 * lançar erro: quem está do outro lado é um visitante no celular, e um campo
 * vazio não pode virar a tela de erro do sistema. O id da igreja vem
 * vinculado pela página (bind), e o service valida o formato de novo.
 */

export async function submitPrayerRequestAction(
  churchId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getPublicSubmissionService()).submitPrayerRequest({
      churchId,
      name: formData.get("name") ?? "",
      message: formData.get("message") ?? "",
    });
    return { success: "Recebemos o seu pedido. Vamos orar por você." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function submitVisitorAction(
  churchId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getPublicSubmissionService()).submitVisitor({
      churchId,
      name: formData.get("name") ?? "",
      contact: formData.get("contact") ?? "",
    });
    return { success: "Obrigado! Alguém da igreja vai falar com você." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function submitEventSignupAction(
  eventId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getPublicSubmissionService()).submitEventSignup({
      eventId,
      personName: formData.get("person_name") ?? "",
      contact: formData.get("contact") ?? "",
    });
    return { success: "Inscrição feita. Até lá!" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateChurchTemplateAction(
  churchId: string,
  formData: FormData,
) {
  const mode = String(formData.get("template_mode") ?? "inherit");
  const templateId = formData.get("template_id");

  const supabase = await getChurchClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/login");
  }

  // Estar logado não basta: sem isto, qualquer usuário autenticado que
  // soubesse o id trocava o template de uma igreja de OUTRA empresa (a action
  // é endereçável por quem conhece o id). A RLS é a barreira final, não a
  // única — mesma regra do resto do projeto.
  const { active } = await getActiveTenant();
  if (!active) {
    throw new AppError("unauthorized", "Selecione uma empresa para continuar.");
  }
  if (active.role !== "owner" && active.role !== "admin") {
    throw new AppError("forbidden", "Só quem administra a igreja pode trocar o template.");
  }

  const payload: { template_mode: string; template_id?: string | null } = {
    template_mode: mode === "custom" ? "custom" : "inherit",
  };

  payload.template_id =
    mode === "custom" && typeof templateId === "string" && templateId
      ? templateId
      : null;

  const { error } = await supabase
    .from("churches")
    .update(payload)
    .eq("id", churchId)
    .eq("company_id", active.id);

  if (error) {
    throw new AppError(
      "internal_error",
      "Não foi possível atualizar o template.",
    );
  }

  revalidatePath(`/admin/${churchId}/template`);
}
