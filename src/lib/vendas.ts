import { formatarData } from "@/lib/acompanhamento";
import { celulaCsv } from "@/lib/rolMembros";
import type {
  ItemPedido,
  PedidoVenda,
  StatusPedido,
  Venda,
} from "@/types/vendas";

/**
 * Regras puras das vendas (sem I/O): situação da venda, limite de
 * quantidade e resumo dos pedidos. O banco repete o que importa ao gravar.
 */

export type SituacaoVenda =
  "aguardando_pix" | "aberta" | "esgotada" | "encerrada";

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
export function unidadesReservadas(
  pedidos: Pick<PedidoVenda, "quantidade" | "status">[],
): number {
  return pedidos
    .filter((p) => p.status !== "cancelado")
    .reduce((soma, p) => soma + p.quantidade, 0);
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
export function maximoParaPedir(
  maxPorPedido: number | null,
  disponivel: number | null,
): number {
  const limites = [maxPorPedido, disponivel, 1000].filter(
    (v): v is number => v !== null,
  );
  return Math.max(0, Math.min(...limites));
}

export interface ResumoPedidos {
  pedidos: number;
  unidades: number;
  /** Pedidos já retirados. */
  entregues: number;
  pagoCents: number;
  pendenteCents: number;
}

/** Totais da venda (cancelados ficam de fora). */
export function resumirPedidos(
  pedidos: Array<Pick<PedidoVenda, "quantidade" | "totalCents" | "status"> & { entregueEm?: string | null }>,
): ResumoPedidos {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  return {
    pedidos: validos.length,
    unidades: validos.reduce((s, p) => s + p.quantidade, 0),
    entregues: validos.filter((p) => p.entregueEm).length,
    pagoCents: validos
      .filter((p) => p.status === "pago")
      .reduce((s, p) => s + p.totalCents, 0),
    pendenteCents: validos
      .filter((p) => p.status === "pendente")
      .reduce((s, p) => s + p.totalCents, 0),
  };
}

/**
 * Mensagem pronta do comprovante, para o WhatsApp de quem organiza. Leva o
 * que a pessoa precisa conferir: quem pediu, o quê, quanto e a observação.
 */
export function mensagemDoComprovante(pedido: {
  titulo: string;
  nome: string;
  quantidade: number;
  /** Com opções: "2 Carne, 1 Queijo". */
  itens?: string | null;
  totalFormatado: string;
  observacao: string | null;
  /** Link do voucher, quando a venda gera. */
  voucherUrl?: string | null;
}): string {
  return [
    `Olá! Segue o comprovante do Pix do meu pedido de ${pedido.titulo}.`,
    `Nome: ${pedido.nome}`,
    pedido.itens
      ? `Itens: ${pedido.itens}`
      : `Quantidade: ${pedido.quantidade}`,
    `Total: ${pedido.totalFormatado}`,
    ...(pedido.observacao ? [`Observação: ${pedido.observacao}`] : []),
    ...(pedido.voucherUrl ? [`Voucher: ${pedido.voucherUrl}`] : []),
  ].join("\n");
}

/** "2 Carne, 1 Queijo". */
export function descreverItens(
  itens: Pick<ItemPedido, "nome" | "quantidade">[],
): string {
  return itens.map((i) => `${i.quantidade} ${i.nome}`).join(", ");
}

export interface TotalPorItem {
  nome: string;
  /** Unidades em pedidos não cancelados. */
  unidades: number;
  /** Dessas, quantas já estão pagas. */
  pagas: number;
  /** E quantas já foram retiradas. */
  entregues: number;
  totalCents: number;
}

/**
 * Quanto saiu de cada opção (a lista para a confecção ou a cozinha). Junta
 * pelo nome gravado no pedido; cancelados ficam de fora. Na ordem das
 * opções da venda, e o que não está mais nela (opção tirada) no fim.
 */
export function totaisPorItem(
  pedidos: PedidoVenda[],
  ordem: string[] = [],
): TotalPorItem[] {
  const mapa = new Map<string, TotalPorItem>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    for (const i of p.itens) {
      const atual = mapa.get(i.nome) ?? {
        nome: i.nome,
        unidades: 0,
        pagas: 0,
        entregues: 0,
        totalCents: 0,
      };
      atual.unidades += i.quantidade;
      if (p.status === "pago") atual.pagas += i.quantidade;
      if (p.entregueEm) atual.entregues += i.quantidade;
      atual.totalCents += i.totalCents;
      mapa.set(i.nome, atual);
    }
  }
  const posicao = (nome: string) => {
    const i = ordem.indexOf(nome);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...mapa.values()].sort(
    (a, b) =>
      posicao(a.nome) - posicao(b.nome) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Pontos de partida para as opções. A pessoa edita à vontade. */
export const MODELOS_DE_OPCOES: Array<{ nome: string; opcoes: string[] }> = [
  {
    nome: "Camiseta",
    opcoes: [
      "P Masculina",
      "M Masculina",
      "G Masculina",
      "GG Masculina",
      "P Feminina",
      "M Feminina",
      "G Feminina",
      "GG Feminina",
    ],
  },
  { nome: "Pastel", opcoes: ["Carne", "Queijo", "Frango", "Pizza"] },
  {
    nome: "Lanche",
    opcoes: ["Cachorro-quente", "Misto quente", "Refrigerante", "Suco"],
  },
];

// ---------------------------------------------------------------------- CSV
const valorCsv = (centavos: number) =>
  (centavos / 100).toFixed(2).replace(".", ",");

const dataHoraCsv = (iso: string) => {
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);
  return `${formatarData(dia)} ${hora.format(d)}`;
};

/**
 * Os pedidos em CSV (ponto e vírgula e BOM: abre direto no Excel em
 * português). Com opções, uma coluna por opção com a quantidade, para somar
 * na planilha. No fim, o total de cada opção (sem os cancelados).
 */
export function pedidosParaCsv(
  venda: Pick<Venda, "titulo" | "temOpcoes" | "opcoes" | "geraVoucher">,
  pedidos: PedidoVenda[],
): string {
  const totais = totaisPorItem(
    pedidos,
    venda.opcoes.map((o) => o.nome),
  );
  // Colunas na ordem da venda (opção sem pedido também, para mostrar o zero);
  // opção que saiu da venda, mas tem pedido, vai no fim.
  const colunasItens = venda.temOpcoes
    ? [
        ...venda.opcoes.map((o) => o.nome),
        ...totais.map((t) => t.nome).filter((n) => !venda.opcoes.some((o) => o.nome === n)),
      ]
    : [];

  const cabecalho = [
    "Data",
    "Nome",
    "WhatsApp",
    "Situação",
    ...(venda.temOpcoes ? colunasItens : ["Quantidade"]),
    "Total",
    "Observação",
    ...(venda.geraVoucher ? ["Voucher", "Entregue em", "Obs. da entrega"] : []),
  ];
  const linhas = [cabecalho.map(celulaCsv).join(";")];
  for (const p of [...pedidos].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )) {
    const porNome = new Map(p.itens.map((i) => [i.nome, i.quantidade]));
    linhas.push(
      [
        dataHoraCsv(p.createdAt),
        celulaCsv(p.nome),
        celulaCsv(p.telefone),
        STATUS_PEDIDO[p.status],
        ...(venda.temOpcoes
          ? colunasItens.map((n) => String(porNome.get(n) ?? 0))
          : [String(p.quantidade)]),
        valorCsv(p.totalCents),
        celulaCsv(p.observacao),
        ...(venda.geraVoucher
          ? [p.voucherCodigo ?? "", p.entregueEm ? dataHoraCsv(p.entregueEm) : "", celulaCsv(p.entregaObs)]
          : []),
      ].join(";"),
    );
  }

  const resumo = resumirPedidos(pedidos);
  linhas.push("");
  linhas.push(
    [
      "Resumo (sem cancelados)",
      "",
      "",
      "",
      ...(venda.temOpcoes ? colunasItens.map(() => "") : [""]),
      "",
      "",
    ].join(";"),
  );
  linhas.push(["Unidades", String(resumo.unidades)].join(";"));
  linhas.push(["Pago", valorCsv(resumo.pagoCents)].join(";"));
  linhas.push(["A confirmar", valorCsv(resumo.pendenteCents)].join(";"));
  if (venda.geraVoucher) linhas.push(["Pedidos entregues", String(resumo.entregues)].join(";"));
  if (venda.temOpcoes) {
    linhas.push("");
    linhas.push(["Opção", "Unidades", "Pagas", ...(venda.geraVoucher ? ["Entregues"] : []), "Total"].join(";"));
    for (const t of totais)
      linhas.push(
        [
          celulaCsv(t.nome),
          String(t.unidades),
          String(t.pagas),
          ...(venda.geraVoucher ? [String(t.entregues)] : []),
          valorCsv(t.totalCents),
        ].join(";"),
      );
  }
  return `﻿${linhas.join("\r\n")}\r\n`;
}

export type FiltroPedido = "todos" | StatusPedido;

/** Filtro da lista de pedidos: situação e nome/WhatsApp (sem acento, sem maiúscula). */
export function filtrarPedidos(pedidos: PedidoVenda[], filtro: { status: FiltroPedido; busca: string }): PedidoVenda[] {
  const sem = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const termo = sem(filtro.busca.trim());
  const digitos = filtro.busca.replace(/\D/g, "");
  return pedidos.filter(
    (p) =>
      (filtro.status === "todos" || p.status === filtro.status) &&
      (!termo || sem(p.nome).includes(termo) || (digitos.length >= 4 && p.telefone.replace(/\D/g, "").includes(digitos))),
  );
}

/** Código curto do voucher como a pessoa digita ("k7p4qx", "K7P 4QX") → "K7P-4QX"; null se não parece um. */
export function normalizarCodigoVoucher(texto: string): string | null {
  const limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6}$/.test(limpo) ? `${limpo.slice(0, 3)}-${limpo.slice(3)}` : null;
}
