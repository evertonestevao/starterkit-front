"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { getEbdRevistasActor, getEbdRevistasService, getIgrejaDosPedidos } from "@/server/ebdRevistas";
import { toActionError, type ActionState } from "./action-state";

/**
 * Server actions dos pedidos de revista da EBD. O papel vem da sessão; o
 * service valida e o banco confere de novo a gestão da EBD em cada função.
 */

const PAGINA = "/dashboard/ebd/revistas";

async function ator() {
  const actor = await getEbdRevistasActor();
  if (!actor) throw new AppError("forbidden", "Só a secretaria da EBD cuida dos pedidos de revista.");
  return actor;
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");

export async function salvarRevistaAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    await (
      await getEbdRevistasService()
    ).salvarRevista(await ator(), {
      id: texto(fd, "id"),
      trimestreId: texto(fd, "trimestreId"),
      titulo: texto(fd, "titulo"),
      precoCentavos: texto(fd, "preco"),
      classeId: texto(fd, "classeId"),
    });
    revalidatePath(PAGINA);
    return { success: "Revista salva." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerRevistaAction(revistaId: string): Promise<ActionState> {
  try {
    await (await getEbdRevistasService()).removerRevista(await ator(), revistaId);
    revalidatePath(PAGINA);
    return { success: "Revista removida da lista." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function copiarRevistasAction(deTrimestreId: string, paraTrimestreId: string): Promise<ActionState> {
  try {
    const quantas = await (await getEbdRevistasService()).copiarRevistas(await ator(), deTrimestreId, paraTrimestreId);
    revalidatePath(PAGINA);
    return {
      success:
        quantas === 0
          ? "Nada para copiar: as revistas daquele trimestre já estão aqui."
          : `${quantas} ${quantas === 1 ? "revista copiada" : "revistas copiadas"}. Confira os preços.`,
    };
  } catch (err) {
    return toActionError(err);
  }
}

/** Pedido novo ou alterado. Os itens chegam como `revista_<id>` = quantidade. */
export async function salvarPedidoRevistaAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const itens = [...fd.entries()]
      .filter(([campo, valor]) => campo.startsWith("revista_") && Number(valor) > 0)
      .map(([campo, valor]) => ({ revistaId: campo.slice("revista_".length), quantidade: String(valor) }));
    const id = texto(fd, "id");
    const igreja = await getIgrejaDosPedidos();
    if (!igreja) throw new AppError("forbidden", "Selecione uma igreja para continuar.");
    await (
      await getEbdRevistasService()
    ).salvarPedido(
      await ator(),
      {
        id,
        trimestreId: texto(fd, "trimestreId"),
        membroId: texto(fd, "membroId"),
        nome: texto(fd, "nome"),
        telefone: texto(fd, "telefone"),
        observacao: texto(fd, "observacao"),
        itens,
      },
      igreja.id,
    );
    revalidatePath(PAGINA);
    return { success: id ? "Pedido alterado." : "Pedido registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Pedido de uma congregação fora do sistema: só as quantidades (`revista_<id>` = quantidade). */
export async function salvarPedidoExternoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const itens = [...fd.entries()]
      .filter(([campo, valor]) => campo.startsWith("revista_") && Number(valor) > 0)
      .map(([campo, valor]) => ({ revistaId: campo.slice("revista_".length), quantidade: String(valor) }));
    const id = texto(fd, "id");
    await (
      await getEbdRevistasService()
    ).salvarExterno(await ator(), {
      id,
      trimestreId: texto(fd, "trimestreId"),
      nome: texto(fd, "nome"),
      itens,
    });
    revalidatePath(PAGINA);
    return { success: id ? "Pedido da congregação alterado." : "Pedido da congregação registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerPedidoExternoAction(pedidoId: string): Promise<ActionState> {
  try {
    await (await getEbdRevistasService()).removerExterno(await ator(), pedidoId);
    revalidatePath(PAGINA);
    return { success: "Pedido da congregação removido." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function registrarPagamentoRevistaAction(
  _prev: ActionState | undefined,
  fd: FormData,
): Promise<ActionState> {
  try {
    await (
      await getEbdRevistasService()
    ).registrarPagamento(await ator(), {
      pedidoId: texto(fd, "pedidoId"),
      valorCentavos: texto(fd, "valor"),
      data: texto(fd, "data"),
      forma: texto(fd, "forma") || "dinheiro",
    });
    revalidatePath(PAGINA);
    return { success: "Pagamento registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function estornarPagamentoRevistaAction(pagamentoId: string): Promise<ActionState> {
  try {
    await (await getEbdRevistasService()).estornarPagamento(await ator(), pagamentoId);
    revalidatePath(PAGINA);
    return { success: "Pagamento desfeito." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function marcarEntregaRevistaAction(pedidoId: string, entregue: boolean): Promise<ActionState> {
  try {
    await (await getEbdRevistasService()).marcarEntrega(await ator(), pedidoId, entregue);
    revalidatePath(PAGINA);
    return { success: entregue ? "Marcado como entregue." : "Entrega desmarcada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cancelarPedidoRevistaAction(pedidoId: string): Promise<ActionState> {
  try {
    await (await getEbdRevistasService()).cancelarPedido(await ator(), pedidoId);
    revalidatePath(PAGINA);
    return { success: "Pedido cancelado." };
  } catch (err) {
    return toActionError(err);
  }
}
