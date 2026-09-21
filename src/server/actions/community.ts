"use server";

import { revalidatePath } from "next/cache";
import { getCommunityService } from "@/server/community";

/**
 * Marca os pedidos de oração como vistos até `seenUpTo` (o `created_at` do
 * mais recente que a tela mostrou). Chamada direto de um componente cliente
 * (sem `<form>`), como `switchCompanyAction`.
 *
 * `revalidatePath` só invalida o CACHE do servidor; quem chama ainda precisa
 * de `router.refresh()` no client para a sidebar (que está montada nesta
 * mesma navegação, não numa nova) buscar os dados de novo — ver
 * MarkPrayerRequestsSeen.
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
