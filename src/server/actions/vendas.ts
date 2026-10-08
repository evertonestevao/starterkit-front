"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError } from "@/lib/errors";
import { createRateLimiter } from "@/server/rateLimit";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";
import { toActionError, type ActionState } from "./action-state";

/** Server actions das Vendas no painel. O service confere o acesso; o banco, de novo. */

const BASE = "/dashboard/vendas";
/** E-mail de confirmação: no máximo 5 por venda a cada hora. */
const emailLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

async function ator() {
  const actor = await getVendasActorAutorizado();
  if (!actor) throw new AppError("forbidden", "Você não tem acesso às vendas desta igreja.");
  return actor;
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

function inteiroOuNulo(valor: string, mensagem: string): number | null {
  if (valor === "") return null;
  if (!/^\d+$/.test(valor)) throw new AppError("validation_error", mensagem);
  return Number(valor);
}

/** Nova venda, ou edição quando vem `id`. Nova vai para a tela dela. */
export async function salvarVendaAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  const id = texto(fd, "id") || null;
  let destino: string | null = null;
  try {
    const actor = await ator();
    const preco = parseBrlToCents(texto(fd, "preco"));
    if (preco === null) throw new AppError("validation_error", "Valor inválido.");
    const salvo = await (
      await getVendasService()
    ).salvar(actor, id, {
      titulo: texto(fd, "titulo"),
      descricao: texto(fd, "descricao") || null,
      precoCents: preco,
      pixChave: texto(fd, "pixChave"),
      pixTitular: texto(fd, "pixTitular"),
      encerraEm: texto(fd, "encerraEm") || null,
      estoque: inteiroOuNulo(texto(fd, "estoque"), "Estoque inválido."),
      maxPorPedido: inteiroOuNulo(texto(fd, "maxPorPedido"), "Máximo por pedido inválido."),
    });
    revalidatePath(BASE, "layout");
    revalidatePath("/igreja/[public_code]", "layout");
    if (!id) {
      destino = `${BASE}/${salvo.id}`;
    } else {
      return {
        success: salvo.precisaConfirmar
          ? salvo.confirmacaoEnviada
            ? "Venda salva. A chave Pix mudou: enviamos o link de confirmação ao Responsável."
            : "Venda salva. A chave Pix mudou e precisa ser confirmada pelo Responsável."
          : "Venda salva.",
      };
    }
  } catch (err) {
    return toActionError(err);
  }
  // Fora do try: redirect lança um sinal interno que o catch engoliria.
  redirect(destino);
}

export async function reenviarConfirmacaoVendaAction(id: string): Promise<ActionState> {
  try {
    const actor = await ator();
    await emailLimiter.consume(`venda-confirmacao:${id}`);
    await (await getVendasService()).reenviarConfirmacao(actor, id);
    return { success: "Enviamos um link novo ao e-mail do Responsável. O anterior deixou de valer." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function definirStatusVendaAction(id: string, status: "ativa" | "encerrada"): Promise<ActionState> {
  try {
    await (await getVendasService()).definirStatus(await ator(), id, status);
    revalidatePath(BASE, "layout");
    revalidatePath("/igreja/[public_code]", "layout");
    return { success: status === "encerrada" ? "Venda encerrada. A página parou de aceitar pedidos." : "Venda reaberta." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function excluirVendaAction(id: string): Promise<ActionState> {
  try {
    await (await getVendasService()).excluir(await ator(), id);
    revalidatePath(BASE, "layout");
    revalidatePath("/igreja/[public_code]", "layout");
  } catch (err) {
    return toActionError(err);
  }
  redirect(BASE);
}

export async function marcarPedidoVendaAction(
  pedidoId: string,
  status: "pendente" | "pago" | "cancelado",
): Promise<ActionState> {
  try {
    await (await getVendasService()).marcarPedido(await ator(), pedidoId, status);
    revalidatePath(BASE, "layout");
    return {
      success: status === "pago" ? "Pedido marcado como pago." : status === "cancelado" ? "Pedido cancelado." : "Pedido voltou para aguardando.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
