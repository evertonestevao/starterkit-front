import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { TermoTexto } from "@/lib/carteirinha";

/**
 * Termo de consentimento (LGPD) em PDF, para o membro assinar no papel. As
 * finalidades saem com um quadradinho para marcar à mão: é a caneta do membro
 * que decide, e a secretaria registra no sistema o que ele marcou.
 */

const PAGINA = { largura: 595.28, altura: 841.89 };
const MARGEM = 64;
const CINZA = rgb(0.35, 0.35, 0.35);
const CORPO = 11;
const ENTRELINHA = 16;

function limpo(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const saida: string[] = [];
  let atual = "";
  for (const palavra of limpo(texto).split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) {
      saida.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

export async function gerarTermoPdf(dados: {
  termo: TermoTexto;
  igreja: string;
  enderecoIgreja: string | null;
  membro: string;
  /** Menor de idade: assina o responsável. */
  menor: boolean;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`Termo de consentimento - ${dados.membro}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const util = PAGINA.largura - MARGEM * 2;

  let pagina: PDFPage = pdf.addPage([PAGINA.largura, PAGINA.altura]);
  let y = PAGINA.altura - MARGEM;
  const garante = (altura: number) => {
    if (y - altura < MARGEM) {
      pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
      y = PAGINA.altura - MARGEM;
    }
  };

  function centralizado(texto: string, fonte: PDFFont, tamanho: number, cor = rgb(0, 0, 0)) {
    for (const linha of quebrar(texto, fonte, tamanho, util)) {
      pagina.drawText(linha, {
        x: (PAGINA.largura - fonte.widthOfTextAtSize(linha, tamanho)) / 2,
        y,
        size: tamanho,
        font: fonte,
        color: cor,
      });
      y -= tamanho + 5;
    }
  }

  function paragrafo(
    texto: string,
    opcoes: { x?: number; fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {},
  ) {
    const x = opcoes.x ?? MARGEM;
    const fonte = opcoes.fonte ?? normal;
    const tamanho = opcoes.tamanho ?? CORPO;
    for (const linha of quebrar(texto, fonte, tamanho, PAGINA.largura - MARGEM - x)) {
      garante(ENTRELINHA);
      pagina.drawText(linha, { x, y, size: tamanho, font: fonte, color: opcoes.cor ?? rgb(0, 0, 0) });
      y -= ENTRELINHA;
    }
  }

  // ---- cabeçalho
  centralizado(dados.igreja, negrito, 13);
  if (dados.enderecoIgreja) centralizado(dados.enderecoIgreja, normal, 9, CINZA);
  y -= 4;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: PAGINA.largura - MARGEM, y }, thickness: 0.8, color: CINZA });
  y -= 34;
  centralizado(dados.termo.titulo.toUpperCase(), negrito, 12);
  y -= 18;

  paragrafo(dados.termo.abertura);
  y -= 10;

  // ---- finalidades, cada uma com o quadradinho para marcar
  for (const f of dados.termo.finalidades) {
    garante(ENTRELINHA * 3);
    pagina.drawRectangle({ x: MARGEM, y: y - 2, width: 11, height: 11, borderColor: rgb(0, 0, 0), borderWidth: 0.9 });
    paragrafo(f.titulo, { x: MARGEM + 20, fonte: negrito });
    paragrafo(f.texto, { x: MARGEM + 20 });
    y -= 8;
  }
  y -= 4;

  for (const d of dados.termo.direitos) {
    paragrafo(d, { tamanho: 10, cor: CINZA });
    y -= 6;
  }

  // ---- data e assinaturas, juntas na mesma página
  garante(dados.menor ? 190 : 140);
  y -= 26;
  paragrafo("Local e data: ______________________________________________");
  y -= 44;
  const meio = PAGINA.largura / 2;
  pagina.drawLine({ start: { x: meio - 150, y }, end: { x: meio + 150, y }, thickness: 0.8, color: rgb(0, 0, 0) });
  y -= 14;
  centralizado(dados.menor ? "Assinatura do responsável legal" : dados.membro, dados.menor ? normal : negrito, 10);
  if (dados.menor) {
    centralizado(`Responsável por ${dados.membro}`, normal, 9, CINZA);
    y -= 22;
    paragrafo("Nome do responsável: ________________________________________________", { tamanho: 10 });
    paragrafo("Parentesco: ______________________    Documento: ______________________", { tamanho: 10 });
  } else {
    centralizado("Assinatura do membro", normal, 9, CINZA);
  }

  return pdf.save();
}
