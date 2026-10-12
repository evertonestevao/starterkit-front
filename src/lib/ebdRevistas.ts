import { formatarReais } from "@/lib/ebd";
import { normalizeSearch } from "@/lib/search";
import type { EbdRevistaPedido } from "@/types/ebdRevistas";

/** EBD → Revistas: contas e filtros dos pedidos (tudo no navegador, sem I/O). */

export const FORMA_LABEL = { dinheiro: "Dinheiro", pix: "Pix", outro: "Outro" } as const;

export function totalDoPedido(pedido: Pick<EbdRevistaPedido, "itens">): number {
  return pedido.itens.reduce((soma, i) => soma + i.quantidade * i.precoCentavos, 0);
}

export function pagoDoPedido(pedido: Pick<EbdRevistaPedido, "pagamentos">): number {
  return pedido.pagamentos.reduce((soma, p) => soma + p.valorCentavos, 0);
}

/** Quanto falta pagar (nunca negativo). */
export function faltaDoPedido(pedido: Pick<EbdRevistaPedido, "itens" | "pagamentos">): number {
  return Math.max(0, totalDoPedido(pedido) - pagoDoPedido(pedido));
}

export type SituacaoDoPagamento = "pago" | "parcial" | "aberto";

export function situacaoDoPagamento(pedido: Pick<EbdRevistaPedido, "itens" | "pagamentos">): SituacaoDoPagamento {
  const pago = pagoDoPedido(pedido);
  if (pago <= 0) return totalDoPedido(pedido) === 0 ? "pago" : "aberto";
  return faltaDoPedido(pedido) === 0 ? "pago" : "parcial";
}

export type FiltroDePedidos = "todos" | "devendo" | "pagos" | "a_entregar" | "entregues" | "cancelados";

/**
 * Filtra a lista: situação, revista, classe e busca pelo nome. Cancelado só
 * aparece no filtro "cancelados".
 */
export function filtrarPedidos(
  pedidos: readonly EbdRevistaPedido[],
  filtro: { situacao: FiltroDePedidos; revistaId: string; classe: string; busca: string },
): EbdRevistaPedido[] {
  const termo = normalizeSearch(filtro.busca);
  return pedidos.filter((p) => {
    if (filtro.situacao === "cancelados") {
      if (!p.cancelado) return false;
    } else {
      if (p.cancelado) return false;
      if (filtro.situacao === "devendo" && faltaDoPedido(p) === 0) return false;
      if (filtro.situacao === "pagos" && faltaDoPedido(p) > 0) return false;
      if (filtro.situacao === "a_entregar" && p.entregueEm) return false;
      if (filtro.situacao === "entregues" && !p.entregueEm) return false;
    }
    if (filtro.revistaId && !p.itens.some((i) => i.revistaId === filtro.revistaId)) return false;
    if (filtro.classe && (p.classeNome ?? "") !== filtro.classe) return false;
    return !termo || normalizeSearch(p.nome).includes(termo);
  });
}

export interface ResumoDosPedidos {
  pedidos: number;
  revistas: number;
  totalCentavos: number;
  recebidoCentavos: number;
  aReceberCentavos: number;
  devendo: number;
  entregues: number;
  aEntregar: number;
  /** Dinheiro recebido em pedidos cancelados (para devolver ou acertar). */
  recebidoEmCanceladosCentavos: number;
}

/** Números do trimestre. Cancelado fica de fora, menos o dinheiro que já entrou nele. */
export function resumoDosPedidos(pedidos: readonly EbdRevistaPedido[]): ResumoDosPedidos {
  const ativos = pedidos.filter((p) => !p.cancelado);
  const totalCentavos = ativos.reduce((s, p) => s + totalDoPedido(p), 0);
  const aReceberCentavos = ativos.reduce((s, p) => s + faltaDoPedido(p), 0);
  return {
    pedidos: ativos.length,
    revistas: ativos.reduce((s, p) => s + p.itens.reduce((q, i) => q + i.quantidade, 0), 0),
    totalCentavos,
    recebidoCentavos: ativos.reduce((s, p) => s + pagoDoPedido(p), 0),
    aReceberCentavos,
    devendo: ativos.filter((p) => faltaDoPedido(p) > 0).length,
    entregues: ativos.filter((p) => p.entregueEm).length,
    aEntregar: ativos.filter((p) => !p.entregueEm).length,
    recebidoEmCanceladosCentavos: pedidos.filter((p) => p.cancelado).reduce((s, p) => s + pagoDoPedido(p), 0),
  };
}

export interface LinhaDaCompra {
  revistaId: string;
  titulo: string;
  quantidade: number;
  /** Soma do que as pessoas vão pagar por esta revista (preço de cada pedido). */
  valorCentavos: number;
}

/** Lista de compra: quantas revistas de cada título pedir (pedidos ativos). */
export function resumoDaCompra(pedidos: readonly EbdRevistaPedido[]): LinhaDaCompra[] {
  const porRevista = new Map<string, LinhaDaCompra>();
  for (const p of pedidos) {
    if (p.cancelado) continue;
    for (const i of p.itens) {
      const linha = porRevista.get(i.revistaId) ?? {
        revistaId: i.revistaId,
        titulo: i.titulo,
        quantidade: 0,
        valorCentavos: 0,
      };
      linha.quantidade += i.quantidade;
      linha.valorCentavos += i.quantidade * i.precoCentavos;
      porRevista.set(i.revistaId, linha);
    }
  }
  return [...porRevista.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** O resumo da compra em texto, para colar no WhatsApp ou no e-mail do fornecedor. */
export function textoDoResumoDaCompra(input: {
  igreja: string;
  trimestre: string;
  linhas: readonly LinhaDaCompra[];
}): string {
  const total = input.linhas.reduce((s, l) => s + l.quantidade, 0);
  const valor = input.linhas.reduce((s, l) => s + l.valorCentavos, 0);
  return [
    `Pedido de revistas da EBD - ${input.trimestre}`,
    input.igreja,
    "",
    ...input.linhas.map((l) => `${l.quantidade} x ${l.titulo}`),
    "",
    `Total: ${total} ${total === 1 ? "revista" : "revistas"} (${formatarReais(valor)})`,
  ].join("\n");
}
