import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData } from "@/lib/acompanhamento";
import { SITUACAO_LABEL } from "@/lib/fichaMembro";
import { mascaraTelefone } from "@/lib/telefone";
import type { RolMembro } from "@/types/acompanhamento";

/**
 * Rol de membros em PDF (A4 deitado), para imprimir ou arquivar. Só os dados
 * da lista (nome, situação, cargos, telefone, datas); a ficha completa sai na
 * planilha. Mesma fonte padrão do relatório da EBD: acentos sim, emoji não.
 */

export interface RolPdf {
  igreja: string;
  /** O que foi filtrado, em texto ("Ativos · Diácono"). */
  filtros: string;
  /** YYYY-MM-DD. */
  emitidoEm: string;
  membros: RolMembro[];
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
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = limpo(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

const COLUNAS = [
  { titulo: "Nº", largura: 30 },
  { titulo: "Nome", largura: 0 }, // o que sobrar
  { titulo: "Situação", largura: 70 },
  { titulo: "Quadro", largura: 66 },
  { titulo: "Cargos", largura: 170 },
  { titulo: "Telefone", largura: 96 },
  { titulo: "Nascimento", largura: 66 },
  { titulo: "Batismo", largura: 66 },
];

export async function gerarRolPdf(dados: RolPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`Rol de membros - ${dados.igreja}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const util = PAGINA.largura - MARGEM * 2;
  const larguras = COLUNAS.map((c) => c.largura);
  larguras[1] = util - larguras.reduce((s, l) => s + l, 0);

  let pagina: PDFPage = pdf.addPage([PAGINA.largura, PAGINA.altura]);
  let y = PAGINA.altura - MARGEM;

  const texto = (t: string, x: number, yy: number, tamanho: number, fonte = normal, cor = rgb(0, 0, 0)) =>
    pagina.drawText(limpo(t), { x, y: yy, size: tamanho, font: fonte, color: cor });

  function linha(celulas: string[], destaque = false) {
    if (destaque) {
      pagina.drawRectangle({ x: MARGEM, y: y - ALTURA_LINHA, width: util, height: ALTURA_LINHA, color: FUNDO });
    }
    const fonte = destaque ? negrito : normal;
    let x = MARGEM;
    COLUNAS.forEach((_, i) => {
      pagina.drawRectangle({
        x,
        y: y - ALTURA_LINHA,
        width: larguras[i],
        height: ALTURA_LINHA,
        borderColor: LINHA,
        borderWidth: 0.5,
      });
      texto(caber(celulas[i] ?? "", fonte, 8.5, larguras[i] - 8), x + 4, y - 12, 8.5, fonte);
      x += larguras[i];
    });
    y -= ALTURA_LINHA;
  }

  function cabecalhoDaTabela() {
    linha(
      COLUNAS.map((c) => c.titulo),
      true,
    );
  }

  // Cabeçalho do documento
  texto("ROL DE MEMBROS", MARGEM, y - 8, 8, normal, CINZA);
  texto(caber(dados.igreja, negrito, 17, util), MARGEM, y - 28, 17, negrito);
  texto(
    `${dados.filtros} · ${dados.membros.length} ${dados.membros.length === 1 ? "pessoa" : "pessoas"} · emitido em ${formatarData(dados.emitidoEm)}`,
    MARGEM,
    y - 44,
    9.5,
  );
  y -= 56;

  if (dados.membros.length === 0) {
    texto("Ninguém com esses filtros.", MARGEM, y - 10, 10);
  } else {
    cabecalhoDaTabela();
    dados.membros.forEach((m, i) => {
      // Página nova repete o cabeçalho da tabela.
      if (y - ALTURA_LINHA < MARGEM + 16) {
        pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
        y = PAGINA.altura - MARGEM;
        cabecalhoDaTabela();
      }
      linha([
        String(i + 1),
        m.nome,
        SITUACAO_LABEL[m.situacao],
        m.membroIgreja ? "Membro" : "Não membro",
        m.cargos.map((c) => c.nome).join(", "),
        mascaraTelefone(m.whatsapp),
        m.nascimento ? formatarData(m.nascimento) : "",
        m.batismo ? formatarData(m.batismo) : "",
      ]);
    });
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
