"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getCommunityService } from "@/server/community";
import { getActiveTenant } from "@/server/tenant";
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
 * Pedido de visita: marca como feita (data, quem foi e como foi) ou desfaz.
 * O service valida; a RPC confere que o pedido é da PRÓPRIA igreja de quem marca.
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
      membroIds: desfazer ? [] : formData.getAll("membroIds").map(String),
      outros: desfazer ? null : String(formData.get("outros") ?? ""),
      observacao: desfazer ? null : String(formData.get("observacao") ?? ""),
    });
    // O número no menu e o painel dependem disto.
    revalidatePath("/dashboard", "layout");
    return { success: desfazer ? "Visita desfeita: o pedido voltou para a etapa anterior." : "Visita registrada." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Pedido de visita: registra que a equipe já falou com a pessoa (e o dia combinado), ou desfaz. */
export async function registrarContatoVisitaAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const desfazer = formData.get("desfazer") === "1";
    await (await getCommunityService()).registrarContato({
      visitorId: String(formData.get("visitorId") ?? ""),
      agendadaPara: String(formData.get("agendadaPara") ?? ""),
      observacao: String(formData.get("observacao") ?? ""),
      desfazer,
    });
    revalidatePath("/dashboard", "layout");
    return { success: desfazer ? "O pedido voltou para aguardando contato." : "Contato registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Empresa da sessão: nunca do formulário. */
async function empresaAtiva(): Promise<string> {
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return active.id;
}

/** Pedido de oração: marca "já oramos" ou desfaz (um pedido). */
export async function marcarPedidoOradoAction(pedidoId: string, orado: boolean): Promise<ActionState> {
  try {
    await (await getCommunityService()).marcarOrados(await empresaAtiva(), [pedidoId], orado);
    revalidatePath("/dashboard", "layout");
    return { success: orado ? "Marcado: já oramos por este pedido." : "O pedido voltou para aguardando oração." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Marca todos os pedidos que aguardam oração (ex.: depois de um culto de oração). */
export async function marcarTodosOradosAction(): Promise<ActionState> {
  try {
    const n = await (await getCommunityService()).marcarOrados(await empresaAtiva(), "todos", true);
    revalidatePath("/dashboard", "layout");
    return { success: n === 1 ? "1 pedido marcado como orado." : `${n} pedidos marcados como orados.` };
  } catch (err) {
    return toActionError(err);
  }
}

/** Anotação da liderança no pedido de oração (vazia apaga). */
export async function anotarPedidoOracaoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getCommunityService()).anotarPedido(
      String(formData.get("pedidoId") ?? ""),
      String(formData.get("anotacao") ?? ""),
    );
    revalidatePath("/dashboard/prayers");
    return { success: "Anotação salva." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Tira da tela um pedido de oração ou de visita ofensivo ou de spam. */
export async function ocultarPedidoAction(tipo: "oracao" | "visita", pedidoId: string): Promise<ActionState> {
  try {
    const companyId = await empresaAtiva();
    await (await getCommunityService()).ocultarPedido(tipo, pedidoId);
    await recordAudit({
      companyId,
      action: tipo === "oracao" ? "prayer_request.hidden" : "visit_request.hidden",
      entityType: tipo === "oracao" ? "prayer_request" : "visitor",
      entityId: pedidoId,
    });
    revalidatePath("/dashboard", "layout");
    return { success: "Pedido ocultado." };
  } catch (err) {
    return toActionError(err);
  }
}
