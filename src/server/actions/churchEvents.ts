"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getChurchEventsService } from "@/server/churchEvents";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions dos eventos, do lado da igreja. */

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function createChurchEventAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let destino: string;
  try {
    // Empresa e papel vêm da sessão, nunca do formulário.
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");

    const service = await getChurchEventsService();
    const titulo = texto(formData, "titulo");
    const id = await service.createEvent(
      { companyId: active.id, role: active.role },
      {
        churchId: texto(formData, "churchId"),
        titulo,
        descricao: texto(formData, "descricao"),
        inicio: texto(formData, "inicio"),
        fim: texto(formData, "fim"),
        local: texto(formData, "local"),
        preco: texto(formData, "preco"),
        inscricoesAbertas: formData.get("inscricoesAbertas") === "on",
      },
    );

    await recordAudit({
      companyId: active.id,
      action: "church_event.created",
      entityType: "church_event",
      entityId: id,
      metadata: { titulo: titulo.trim() },
    });

    revalidatePath("/dashboard/events");
    destino = `/dashboard/events?evento=${id}&criado=1`;
  } catch (err) {
    return toActionError(err);
  }
  // Fora do try: redirect lança um sinal interno que o catch engoliria.
  redirect(destino);
}
