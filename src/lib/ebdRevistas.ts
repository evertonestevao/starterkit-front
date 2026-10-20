import { formatarReais } from "@/lib/ebd";
import { normalizeSearch } from "@/lib/search";
import type { EbdRevista, EbdRevistaPedido, EbdRevistaQuantidade, EbdRevistasRede } from "@/types/ebdRevistas";

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

/** Uma coluna da aba Rede: uma igreja do sistema ou uma congregação fora dele. */
export interface ColunaDaRede {
  chave: string;
  nome: string;
  /** Congregação fora do sistema (quantidades informadas pela igreja de cima). */
  externo: boolean;
  /** Pedidos registrados no sistema (só para as igrejas do sistema). */
  pedidos: number | null;
  /** Total de revistas desta coluna. */
  total: number;
}

export interface TotalDaRede {
  colunas: ColunaDaRede[];
  /** Uma linha por revista (só as que alguém pediu), na ordem da lista do trimestre. */
  linhas: Array<{ revistaId: string; titulo: string; total: number; quantidades: number[] }>;
  total: number;
}

/**
 * Aba Rede: o total de cada revista somando a igreja que compra, as
 * congregações do sistema e as de fora; e quanto cada uma pediu.
 */
export function totalDaRede(
  rede: EbdRevistasRede,
  revistas: ReadonlyArray<Pick<EbdRevista, "id" | "titulo">>,
): TotalDaRede {
  const fontes = [
    ...rede.igrejas.map((i) => ({
      chave: i.churchId,
      nome: i.nome,
      externo: false,
      pedidos: i.pedidos,
      itens: i.itens,
    })),
    ...rede.externos.map((e) => ({ chave: e.id, nome: e.nome, externo: true, pedidos: null, itens: e.itens })),
  ];
  const quantidadeDe = (itens: EbdRevistaQuantidade[], revistaId: string) =>
    itens.filter((i) => i.revistaId === revistaId).reduce((s, i) => s + i.quantidade, 0);
  const linhas = revistas
    .map((r) => {
      const quantidades = fontes.map((f) => quantidadeDe(f.itens, r.id));
      return { revistaId: r.id, titulo: r.titulo, quantidades, total: quantidades.reduce((s, q) => s + q, 0) };
    })
    .filter((l) => l.total > 0);
  return {
    colunas: fontes.map((f, i) => ({
      chave: f.chave,
      nome: f.nome,
      externo: f.externo,
      pedidos: f.pedidos,
      total: linhas.reduce((s, l) => s + l.quantidades[i], 0),
    })),
    linhas,
    total: linhas.reduce((s, l) => s + l.total, 0),
  };
}

/** O pedido da rede em texto, para mandar ao fornecedor. */
export function textoDoPedidoDaRede(input: { igreja: string; trimestre: string; rede: TotalDaRede }): string {
  const { rede } = input;
  return [
    `Pedido de revistas da EBD - ${input.trimestre}`,
    `${input.igreja} e congregações`,
    "",
    ...rede.linhas.map((l) => `${l.total} x ${l.titulo}`),
    "",
    `Total: ${rede.total} ${rede.total === 1 ? "revista" : "revistas"}`,
  ].join("\n");
}

/**
 * O trimestre dos pedidos quando ninguém escolheu: o próximo (é para ele que
 * se pede revista agora); se não houver, o de hoje; senão, o mais recente.
 */
export function trimestreDosPedidos<T extends { id: string; inicio: string; fim: string }>(
  trimestres: readonly T[],
  hoje: string,
  escolhidoId?: string,
): T | null {
  const ordenados = [...trimestres].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const proximo = [...ordenados].reverse().find((t) => t.inicio > hoje);
  return (
    ordenados.find((t) => t.id === escolhidoId) ??
    proximo ??
    ordenados.find((t) => t.inicio <= hoje && hoje <= t.fim) ??
    ordenados[0] ??
    null
  );
}
