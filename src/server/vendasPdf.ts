import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { formatarData } from "@/lib/acompanhamento";
import {
  STATUS_PEDIDO,
  descreverItens,
  resumirPedidos,
  totaisPorItem,
} from "@/lib/vendas";
import { formatCents } from "@/services/sponsorPricing";
import type { PedidoVenda, Venda } from "@/types/vendas";

/**
 * Pedidos de uma venda em PDF (A4 deitado), para imprimir e conferir na
 * entrega ou na produção: o resumo, o total de cada opção e a lista de
 * pedidos. Mesma fonte padrão dos outros PDFs: acentos sim, emoji não.
 */

export interface VendaPdf {
  igreja: string;
  /** YYYY-MM-DD. */
  emitidoEm: string;
  venda: Pick<
    Venda,
    "titulo" | "temOpcoes" | "opcoes" | "geraVoucher" | "precoCents"
  >;
  pedidos: PedidoVenda[];
}

const PAGINA = { largura: 841.89, altura: 595.28 };
const MARGEM = 36;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.6, 0.6, 0.6);
const FUNDO = rgb(0.94, 0.94, 0.94);
const ALTURA_LINHA = 18;

function limpo(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function caber(
  texto: string,
  fonte: PDFFont,
  tamanho: number,
  largura: number,
): string {
  let t = limpo(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > largura)
    t = t.slice(0, -1);
  return `${t}...`;
}

const dataHora = (iso: string) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
  return `${formatarData(dia).slice(0, 5)} ${hora}`;
};

export async function gerarVendaPdf(dados: VendaPdf): Promise<Uint8Array> {
  const { venda } = dados;
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`Pedidos - ${venda.titulo}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const util = PAGINA.largura - MARGEM * 2;

  let pagina: PDFPage = pdf.addPage([PAGINA.largura, PAGINA.altura]);
  let y = PAGINA.altura - MARGEM;

  const texto = (
    t: string,
    x: number,
    yy: number,
    tamanho: number,
    fonte = normal,
    cor = rgb(0, 0, 0),
  ) =>
    pagina.drawText(limpo(t), {
      x,
      y: yy,
      size: tamanho,
      font: fonte,
      color: cor,
    });

  /** Tabela com cabeçalho repetido em cada página nova. */
  /** Quebra o texto em linhas que cabem na largura (palavra por palavra). */
  function quebrar(
    t: string,
    fonte: PDFFont,
    tamanho: number,
    largura: number,
  ): string[] {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of limpo(t).split(" ")) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual)
        atual = tentativa;
      else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    // Palavra sozinha maior que a coluna: corta essa linha.
    return linhas.map((l) => caber(l, fonte, tamanho, largura));
  }

  /**
   * Tabela com cabeçalho repetido em cada página nova. Colunas com
   * `quebra` crescem em linhas (itens do pedido não podem sair cortados);
   * as outras cortam com "...".
   */
  function tabela(
    colunas: Array<{
      titulo: string;
      largura: number;
      direita?: boolean;
      quebra?: boolean;
    }>,
    linhas: string[][],
  ) {
    const larguras = colunas.map((c) => c.largura);
    const sobra = util - larguras.reduce((s, l) => s + l, 0);
    const flex = larguras.indexOf(0);
    if (flex >= 0) larguras[flex] = sobra;
    const TAM = 8.5;
    const ENTRELINHA = 10.5;

    const desenhar = (celulas: string[], destaque: boolean) => {
      const fonte = destaque ? negrito : normal;
      const conteudo = colunas.map((col, i) =>
        col.quebra && !destaque
          ? quebrar(celulas[i] ?? "", fonte, TAM, larguras[i] - 8)
          : [caber(celulas[i] ?? "", fonte, TAM, larguras[i] - 8)],
      );
      const altura = Math.max(
        ALTURA_LINHA,
        7.5 + Math.max(...conteudo.map((l) => l.length)) * ENTRELINHA,
      );
      // Não cabe nesta página: abre outra (e repete o cabeçalho).
      if (!destaque && y - altura < MARGEM + 16) {
        pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
        y = PAGINA.altura - MARGEM;
        cabecalho();
      }
      if (destaque) {
        pagina.drawRectangle({
          x: MARGEM,
          y: y - altura,
          width: util,
          height: altura,
          color: FUNDO,
        });
      }
      let x = MARGEM;
      colunas.forEach((col, i) => {
        pagina.drawRectangle({
          x,
          y: y - altura,
          width: larguras[i],
          height: altura,
          borderColor: LINHA,
          borderWidth: 0.5,
        });
        conteudo[i].forEach((t, k) => {
          const xTexto =
            col.direita && !destaque
              ? x + larguras[i] - 4 - fonte.widthOfTextAtSize(t, TAM)
              : x + 4;
          texto(t, xTexto, y - 12 - k * ENTRELINHA, TAM, fonte);
        });
        x += larguras[i];
      });
      y -= altura;
    };

    const cabecalho = () =>
      desenhar(
        colunas.map((c) => c.titulo),
        true,
      );
    cabecalho();
    for (const l of linhas) desenhar(l, false);
  }

  function titulo(t: string) {
    if (y - 40 < MARGEM + 16) {
      pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
      y = PAGINA.altura - MARGEM;
    }
    y -= 14;
    texto(t, MARGEM, y, 11, negrito);
    y -= 8;
  }

  // Cabeçalho do documento
  const resumo = resumirPedidos(dados.pedidos);
  texto(
    `PEDIDOS DA VENDA · ${dados.igreja.toUpperCase()}`,
    MARGEM,
    y - 8,
    8,
    normal,
    CINZA,
  );
  texto(caber(venda.titulo, negrito, 17, util), MARGEM, y - 28, 17, negrito);
  texto(
    [
      `${resumo.pedidos} pedido${resumo.pedidos === 1 ? "" : "s"}`,
      `${resumo.unidades} unidade${resumo.unidades === 1 ? "" : "s"}`,
      `pago ${formatCents(resumo.pagoCents)}`,
      `a confirmar ${formatCents(resumo.pendenteCents)}`,
      ...(venda.geraVoucher
        ? [`${resumo.entregues} entregue${resumo.entregues === 1 ? "" : "s"}`]
        : []),
      `emitido em ${formatarData(dados.emitidoEm)}`,
    ].join(" · "),
    MARGEM,
    y - 44,
    9.5,
  );
  y -= 52;
  texto("Cancelados não entram nos totais.", MARGEM, y - 4, 8, normal, CINZA);
  y -= 8;

  // Total de cada opção (a lista para a confecção ou a cozinha)
  const totais = totaisPorItem(
    dados.pedidos,
    venda.opcoes.map((o) => o.nome),
  );
  if (totais.length > 0) {
    titulo(venda.temOpcoes ? "Total de cada opção" : "Total");
    tabela(
      [
        { titulo: "Opção", largura: 0 },
        { titulo: "Unidades", largura: 70, direita: true },
        { titulo: "Pagas", largura: 70, direita: true },
        ...(venda.geraVoucher
          ? [{ titulo: "Entregues", largura: 70, direita: true }]
          : []),
        { titulo: "Total", largura: 90, direita: true },
      ],
      totais.map((t) => [
        t.nome,
        String(t.unidades),
        String(t.pagas),
        ...(venda.geraVoucher ? [String(t.entregues)] : []),
        formatCents(t.totalCents),
      ]),
    );
  }

  // Pedidos
  titulo("Pedidos");
  if (dados.pedidos.length === 0) {
    texto("Nenhum pedido ainda.", MARGEM, y - 10, 10);
  } else {
    const ordenados = [...dados.pedidos].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    tabela(
      [
        { titulo: "Nº", largura: 28 },
        { titulo: "Data", largura: 62 },
        { titulo: "Nome", largura: 130 },
        { titulo: "WhatsApp", largura: 88 },
        {
          titulo: venda.temOpcoes ? "Itens" : "Qtd.",
          largura: venda.temOpcoes ? 0 : 40,
          quebra: venda.temOpcoes,
        },
        { titulo: "Situação", largura: 104 },
        ...(venda.geraVoucher
          ? [
              { titulo: "Voucher", largura: 54 },
              { titulo: "Entregue", largura: 62 },
            ]
          : []),
        { titulo: "Total", largura: 66, direita: true },
        ...(venda.temOpcoes
          ? []
          : [{ titulo: "Observação", largura: 0, quebra: true }]),
      ],
      ordenados.map((p, i) => [
        String(i + 1),
        dataHora(p.createdAt),
        p.nome,
        p.telefone,
        venda.temOpcoes ? descreverItens(p.itens) : String(p.quantidade),
        STATUS_PEDIDO[p.status],
        ...(venda.geraVoucher
          ? [p.voucherCodigo ?? "", p.entregueEm ? dataHora(p.entregueEm) : ""]
          : []),
        formatCents(p.totalCents),
        ...(venda.temOpcoes ? [] : [p.observacao ?? ""]),
      ]),
    );

    // Com opções, a observação não cabe na tabela: vai numa lista no fim.
    const comObs = ordenados
      .map((p, i) => ({ n: i + 1, p }))
      .filter(({ p }) => p.observacao || p.entregaObs);
    if (venda.temOpcoes && comObs.length > 0) {
      titulo("Observações");
      tabela(
        [
          { titulo: "Nº", largura: 28 },
          { titulo: "Nome", largura: 150 },
          { titulo: "Observação do pedido", largura: 0, quebra: true },
          ...(venda.geraVoucher
            ? [{ titulo: "Obs. da entrega", largura: 200, quebra: true }]
            : []),
        ],
        comObs.map(({ n, p }) => [
          String(n),
          p.nome,
          p.observacao ?? "",
          ...(venda.geraVoucher ? [p.entregaObs ?? ""] : []),
        ]),
      );
    }
  }

  // Numeração das páginas
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(t, {
      x: PAGINA.largura - MARGEM - normal.widthOfTextAtSize(t, 7.5),
      y: MARGEM - 14,
      size: 7.5,
      font: normal,
      color: CINZA,
    });
  });

  return pdf.save();
}
