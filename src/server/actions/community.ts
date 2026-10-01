"use server";

import { revalidatePath } from "next/cache";
import { getCommunityService } from "@/server/community";
import { toActionError, type ActionState } from "./action-state";

/**
 * Marca os pedidos de oração como vistos até `seenUpTo` (o `created_at` do
 * mais recente que a tela mostrou). Chamada direto de um componente cliente
 * (sem `<form>`), como `switchCompanyAction` — e como toda Server Function
 * chamada assim, `revalidatePath` já atualiza sozinha a tela que estiver
 * olhando o caminho invalidado; quem chama não precisa de `router.refresh()`
 * depois (ver MarkPrayerRequestsSeen, que atrasa a CHAMADA a esta action,
 * não algo depois dela).
 *
 * Silenciosa de propósito: isto roda sozinho ao abrir a tela, e um erro aqui
 * não pode virar um alerta atravessado no caminho de quem só queria ler os
 * pedidos.
 */
export async function markPrayerRequestsSeenAction(
  companyId: string,
  seenUpTo: string,
): Promise<void> {
  try {
    await (await getCommunityService()).markPrayerRequestsSeen(companyId, seenUpTo);
    revalidatePath("/dashboard", "layout");
  } catch (err) {
    console.error("[prayer-requests] falha ao marcar como visto", err);
  }
}

/**
 * Pedido de visita: marca como feita (data + quem foi) ou desfaz. O service
 * valida; a RPC confere que o pedido é da PRÓPRIA igreja de quem marca.
 */
export async function registrarVisitaAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const desfazer = formData.get("desfazer") === "1";
    await (await getCommunityService()).registrarVisita({
      visitorId: String(formData.get("visitorId") ?? ""),
      visitadoEm: desfazer ? null : String(formData.get("visitadoEm") ?? ""),
      visitadoPor: desfazer ? null : String(formData.get("visitadoPor") ?? ""),
      observacao: desfazer ? null : String(formData.get("observacao") ?? ""),
    });
    revalidatePath("/dashboard/relationships");
    return { success: desfazer ? "Visita voltou para pendente." : "Visita registrada." };
  } catch (err) {
    return toActionError(err);
  }
}
