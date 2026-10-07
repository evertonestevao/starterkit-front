import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentoPronto } from "@/types/secretaria";

/**
 * Declaração e cartas da secretaria em PDF (A4 em pé): cabeçalho com a
 * igreja, título, texto justificado, data e a linha de assinatura do Pastor.
 * Mesma fonte padrão dos outros PDFs do sistema: acentos sim, emoji não.
 */

const PAGINA = { largura: 595.28, altura: 841.89 };
const MARGEM = 72;
const CINZA = rgb(0.35, 0.35, 0.35);
const CORPO = 12;
const ENTRELINHA = 19;

/** A fonte padrão do PDF só tem Latin-1: troca o que tem equivalente e descarta o resto. */
function limpo(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

/** Quebra o texto em linhas que cabem na largura. Palavra maior que a linha vai sozinha. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[][] {
  const linhas: string[][] = [];
  let atual: string[] = [];
  for (const palavra of limpo(texto).split(/\s+/).filter(Boolean)) {
    const tentativa = [...atual, palavra].join(" ");
    if (atual.length > 0 && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) {
      linhas.push(atual);
      atual = [palavra];
    } else {
      atual.push(palavra);
    }
  }
  if (atual.length > 0) linhas.push(atual);
  return linhas;
}

export async function gerarDocumentoPdf(doc: DocumentoPronto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`${doc.titulo} - ${doc.igreja}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const util = PAGINA.largura - MARGEM * 2;

  let pagina: PDFPage = pdf.addPage([PAGINA.largura, PAGINA.altura]);
  let y = PAGINA.altura - MARGEM;

  const novaPagina = () => {
    pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
    y = PAGINA.altura - MARGEM;
  };
  const garante = (altura: number) => {
    if (y - altura < MARGEM) novaPagina();
  };

  function centralizado(texto: string, fonte: PDFFont, tamanho: number, cor = rgb(0, 0, 0)) {
    // Texto do cabeçalho que não cabe numa linha desce para a seguinte, também centralizado.
    for (const palavras of quebrar(texto, fonte, tamanho, util)) {
      const linha = palavras.join(" ");
      const largura = fonte.widthOfTextAtSize(linha, tamanho);
      pagina.drawText(linha, { x: (PAGINA.largura - largura) / 2, y, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 5;
    }
  }

  // ---- cabeçalho: a igreja
  centralizado(doc.igreja, negrito, 14);
  if (doc.enderecoIgreja) centralizado(doc.enderecoIgreja, normal, 9, CINZA);
  y -= 4;
  pagina.drawLine({
    start: { x: MARGEM, y },
    end: { x: PAGINA.largura - MARGEM, y },
    thickness: 0.8,
    color: CINZA,
  });
  y -= 48;

  // ---- título
  centralizado(doc.titulo.toUpperCase(), negrito, 15);
  y -= 30;

  // ---- texto, justificado (a última linha de cada parágrafo fica à esquerda)
  for (const paragrafo of doc.paragrafos) {
    const linhas = quebrar(paragrafo, normal, CORPO, util);
    linhas.forEach((palavras, i) => {
      garante(ENTRELINHA);
      const ultima = i === linhas.length - 1;
      if (ultima || palavras.length === 1) {
        pagina.drawText(palavras.join(" "), { x: MARGEM, y, size: CORPO, font: normal });
      } else {
        const soPalavras = palavras.reduce((s, p) => s + normal.widthOfTextAtSize(p, CORPO), 0);
        const espaco = (util - soPalavras) / (palavras.length - 1);
        let x = MARGEM;
        for (const p of palavras) {
          pagina.drawText(p, { x, y, size: CORPO, font: normal });
          x += normal.widthOfTextAtSize(p, CORPO) + espaco;
        }
      }
      y -= ENTRELINHA;
    });
    y -= 10;
  }

  // ---- data e assinatura: sempre juntas, na mesma página
  garante(150);
  y -= 24;
  const data = limpo(`${doc.dataExtenso}.`);
  pagina.drawText(data, {
    x: PAGINA.largura - MARGEM - normal.widthOfTextAtSize(data, CORPO),
    y,
    size: CORPO,
    font: normal,
  });
  y -= 80;
  const meio = PAGINA.largura / 2;
  pagina.drawLine({ start: { x: meio - 130, y }, end: { x: meio + 130, y }, thickness: 0.8, color: rgb(0, 0, 0) });
  y -= 16;
  if (doc.pastor) centralizado(doc.pastor, negrito, 11);
  centralizado("Pastor", normal, 10, CINZA);
  centralizado(doc.igreja, normal, 9, CINZA);

  return pdf.save();
}
