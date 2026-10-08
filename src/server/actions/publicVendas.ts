"use server";

import { getConfirmacaoVendaService, getVendasPublicasService } from "@/server/vendas";
import { protegerEnvioPublico } from "@/server/protecaoPublica";
import { toActionError, type ActionState } from "./action-state";

/**
 * Pedido de compra pela página da igreja (sem login). Passa por
 * `protegerEnvioPublico` antes de gravar: barreira contra robôs e limite de
 * envios por pessoa.
 */

const RECUSA = "Não foi possível concluir. Recarregue a página e tente de novo.";

const texto = (fd: FormData, campo: string) => {
  const valor = fd.get(campo);
  return typeof valor === "string" ? valor : "";
};

/** O sucesso devolve o Pix com o total embutido, não só uma frase. */
export interface PedidoVendaState {
  error?: string;
  success?: {
    pedidoId: string;
    totalCents: number;
    pixChave: string;
    pixTitular: string;
    pixCopiaECola: string;
    pixQrDataUrl: string;
  };
}

export async function fazerPedidoVendaAction(
  _prev: PedidoVendaState | undefined,
  fd: FormData,
): Promise<PedidoVendaState> {
  try {
    const vendaId = texto(fd, "vendaId");
    if ((await protegerEnvioPublico("venda", vendaId, fd)).robo) return { error: RECUSA };
    const quantidade = Number(texto(fd, "quantidade"));
    const resultado = await (await getVendasPublicasService()).pedir({
      vendaId,
      nome: texto(fd, "nome"),
      telefone: texto(fd, "telefone"),
      quantidade: Number.isInteger(quantidade) ? quantidade : 0,
      observacao: texto(fd, "observacao") || null,
    });
    return { success: resultado };
  } catch (err) {
    return toActionError(err) as PedidoVendaState;
  }
}

/** Confirmação da chave pelo link do e-mail. Pública: o token é a credencial. */
export async function confirmarChaveVendaAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const { titulo } = await (await getConfirmacaoVendaService()).confirmar(texto(fd, "token"));
    return { success: `Chave confirmada. A venda "${titulo}" já aparece na página da igreja.` };
  } catch (err) {
    return toActionError(err);
  }
}
