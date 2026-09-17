"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getSupabaseServerClient } from "@/server/supabase-server";

async function getChurchClient() {
  const supabase = await getSupabaseServerClient();
  return supabase;
}

export async function submitPrayerRequestAction(
  churchId: string,
  formData: FormData,
) {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    throw new AppError("validation_error", "Escreva o seu pedido de oração.");
  }

  const name = String(formData.get("name") ?? "").trim() || null;
  const supabase = await getChurchClient();
  const { error } = await supabase.from("prayer_requests").insert({
    church_id: churchId,
    name,
    message,
  });

  if (error) {
    throw new AppError(
      "internal_error",
      "Não foi possível registrar o pedido de oração.",
    );
  }

  revalidatePath(`/t/${churchId}`);
}

export async function submitEventSignupAction(
  churchId: string,
  formData: FormData,
) {
  const eventName = String(formData.get("event_name") ?? "").trim();
  const personName = String(formData.get("person_name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  if (!eventName || !personName || !contact) {
    throw new AppError(
      "validation_error",
      "Preencha todos os campos do evento.",
    );
  }

  const supabase = await getChurchClient();
  const { error } = await supabase.from("event_signups").insert({
    church_id: churchId,
    event_name: eventName,
    person_name: personName,
    contact,
  });

  if (error) {
    throw new AppError(
      "internal_error",
      "Não foi possível registrar a inscrição.",
    );
  }

  revalidatePath(`/t/${churchId}`);
}

export async function submitVisitorAction(
  churchId: string,
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  if (!name || !contact) {
    throw new AppError("validation_error", "Informe seu nome e contato.");
  }

  const supabase = await getChurchClient();
  const { error } = await supabase.from("visitors").insert({
    church_id: churchId,
    name,
    contact,
  });

  if (error) {
    throw new AppError(
      "internal_error",
      "Não foi possível registrar o visitante.",
    );
  }

  revalidatePath(`/t/${churchId}`);
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
    .eq("id", churchId);

  if (error) {
    throw new AppError(
      "internal_error",
      "Não foi possível atualizar o template.",
    );
  }

  revalidatePath(`/admin/${churchId}/template`);
}
