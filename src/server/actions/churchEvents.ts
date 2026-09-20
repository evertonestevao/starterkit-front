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

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role };
}

/** Edita um evento publicado. A igreja do evento não muda. */
export async function updateChurchEventAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const eventId = texto(formData, "eventId");
    const titulo = texto(formData, "titulo");
    await (await getChurchEventsService()).updateEvent(actor, {
      eventId,
      titulo,
      descricao: texto(formData, "descricao"),
      inicio: texto(formData, "inicio"),
      fim: texto(formData, "fim"),
      local: texto(formData, "local"),
      preco: texto(formData, "preco"),
      inscricoesAbertas: formData.get("inscricoesAbertas") === "on",
    });
    await recordAudit({
      companyId: actor.companyId,
      action: "church_event.updated",
      entityType: "church_event",
      entityId: eventId,
      metadata: { titulo: titulo.trim() },
    });
    revalidatePath("/dashboard/events");
    return { success: `“${titulo.trim()}” foi atualizado.` };
  } catch (err) {
    return toActionError(err);
  }
}

/** Tira o evento do ar. As inscrições ficam, para a igreja avisar quem se inscreveu. */
export async function removeChurchEventAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const eventId = texto(formData, "eventId");
    await (await getChurchEventsService()).removeEvent(actor, eventId);
    await recordAudit({
      companyId: actor.companyId,
      action: "church_event.removed",
      entityType: "church_event",
      entityId: eventId,
      metadata: {},
    });
    revalidatePath("/dashboard/events");
    return { success: "Evento removido da página. Quem já se inscreveu continua na lista." };
  } catch (err) {
    return toActionError(err);
  }
}
