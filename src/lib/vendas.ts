import type { PedidoVenda, StatusPedido, Venda } from "@/types/vendas";

/**
 * Regras puras das vendas (sem I/O): situação da venda, limite de
 * quantidade e resumo dos pedidos. O banco repete o que importa ao gravar.
 */

export type SituacaoVenda = "aguardando_pix" | "aberta" | "esgotada" | "encerrada";

export const SITUACAO_VENDA: Record<SituacaoVenda, string> = {
  aguardando_pix: "Aguardando confirmação da chave Pix",
  aberta: "Recebendo pedidos",
  esgotada: "Esgotada",
  encerrada: "Encerrada",
};

export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  cancelado: "Cancelado",
};

/** Unidades que contam no estoque: tudo que não foi cancelado. */
export function unidadesReservadas(pedidos: Pick<PedidoVenda, "quantidade" | "status">[]): number {
  return pedidos.filter((p) => p.status !== "cancelado").reduce((soma, p) => soma + p.quantidade, 0);
}

/** Como a venda está agora (hoje = AAAA-MM-DD, horário de Brasília). */
export function situacaoDaVenda(
  venda: Pick<Venda, "status" | "pixConfirmadoEm" | "encerraEm" | "estoque">,
  reservadas: number,
  hoje: string,
): SituacaoVenda {
  if (venda.status === "encerrada") return "encerrada";
  if (venda.encerraEm !== null && venda.encerraEm < hoje) return "encerrada";
  if (venda.pixConfirmadoEm === null) return "aguardando_pix";
  if (venda.estoque !== null && reservadas >= venda.estoque) return "esgotada";
  return "aberta";
}

/** Quanto a pessoa pode pedir de uma vez: o menor entre o máximo por pedido e o que sobrou. */
export function maximoParaPedir(maxPorPedido: number | null, disponivel: number | null): number {
  const limites = [maxPorPedido, disponivel, 1000].filter((v): v is number => v !== null);
  return Math.max(0, Math.min(...limites));
}

export interface ResumoPedidos {
  pedidos: number;
  unidades: number;
  pagoCents: number;
  pendenteCents: number;
}

/** Totais da venda (cancelados ficam de fora). */
export function resumirPedidos(pedidos: Pick<PedidoVenda, "quantidade" | "totalCents" | "status">[]): ResumoPedidos {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  return {
    pedidos: validos.length,
    unidades: validos.reduce((s, p) => s + p.quantidade, 0),
    pagoCents: validos.filter((p) => p.status === "pago").reduce((s, p) => s + p.totalCents, 0),
    pendenteCents: validos.filter((p) => p.status === "pendente").reduce((s, p) => s + p.totalCents, 0),
  };
}
