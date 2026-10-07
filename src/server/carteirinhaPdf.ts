import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_LABEL, codigoEmBlocos } from "@/lib/carteirinha";
import { formatChurchName } from "@/lib/churchName";
import { qrMatriz } from "@/lib/qr";
import type { Carteirinha, FotoMembro } from "@/types/carteirinha";

/**
 * Carteirinha de membro em PDF: frente e verso no tamanho de um cartão
 * (85,6 × 54 mm), numa folha A4, um abaixo do outro — recortar, dobrar na
 * linha do meio e plastificar. Mesma fonte padrão dos outros PDFs do sistema.
 */

const A4 = { largura: 595.28, altura: 841.89 };
/** 85,6 × 54 mm em pontos. */
const CARTAO = { largura: 242.65, altura: 153.07 };
const VERDE = rgb(0.16, 0.33, 0.25);
const CINZA = rgb(0.4, 0.4, 0.4);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0, 0, 0);

function limpo(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = limpo(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

/** Quebra em até `max` linhas; o que sobrar é cortado com reticências na última. */
function linhas(texto: string, fonte: PDFFont, tamanho: number, largura: number, max: number): string[] {
  const saida: string[] = [];
  let atual = "";
  const palavras = limpo(texto).split(/\s+/).filter(Boolean);
  for (let i = 0; i < palavras.length; i++) {
    const tentativa = atual ? `${atual} ${palavras[i]}` : palavras[i]!;
    if (atual && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) {
      if (saida.length === max - 1) {
        saida.push(caber(`${atual} ${palavras.slice(i).join(" ")}`, fonte, tamanho, largura));
        return saida;
      }
      saida.push(atual);
      atual = palavras[i]!;
    } else {
      atual = tentativa;
    }
  }
  if (atual) saida.push(caber(atual, fonte, tamanho, largura));
  return saida;
}

export async function gerarCarteirinhaPdf(dados: {
  carteirinha: Carteirinha;
  foto: FotoMembro | null;
  /** Endereço que o QR Code abre. */
  urlVerificacao: string;
}): Promise<Uint8Array> {
  const { carteirinha: c, foto } = dados;
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`Carteirinha de membro - ${c.nome}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagina: PDFPage = pdf.addPage([A4.largura, A4.altura]);
  const igreja = formatChurchName(c.igreja, c.igrejaSobrenome);

  const x0 = (A4.largura - CARTAO.largura) / 2;
  const topoFrente = A4.altura - 110;
  const yFrente = topoFrente - CARTAO.altura;
  // O verso encosta na frente: a linha entre os dois é a dobra.
  const yVerso = yFrente - CARTAO.altura;

  const texto = (t: string, x: number, y: number, tamanho: number, fonte = normal, cor = PRETO) =>
    pagina.drawText(limpo(t), { x, y, size: tamanho, font: fonte, color: cor });

  // Instrução, fora da área de corte.
  const instrucao = "Recorte pela linha de fora, dobre na linha do meio e plastifique.";
  texto(instrucao, (A4.largura - normal.widthOfTextAtSize(instrucao, 9)) / 2, topoFrente + 18, 9, normal, CINZA);

  // ------------------------------------------------------------------ frente
  const fotoBox = { x: x0 + 12, y: yFrente + 16, largura: 72, altura: 92 };
  // A foto é desenhada ANTES de tudo: o que sobra dela fora da moldura é coberto
  // de branco, e a faixa da igreja e o verso vêm por cima.
  if (foto) {
    const imagem = foto.tipo === "image/png" ? await pdf.embedPng(foto.bytes) : await pdf.embedJpg(foto.bytes);
    // Preenche a moldura sem distorcer: escala pelo lado que sobra menos e centraliza.
    const escala = Math.max(fotoBox.largura / imagem.width, fotoBox.altura / imagem.height);
    const w = imagem.width * escala;
    const h = imagem.height * escala;
    pagina.drawImage(imagem, {
      x: fotoBox.x + (fotoBox.largura - w) / 2,
      y: fotoBox.y + (fotoBox.altura - h) / 2,
      width: w,
      height: h,
    });
    const sobraX = (w - fotoBox.largura) / 2 + 1;
    const sobraY = (h - fotoBox.altura) / 2 + 1;
    if (sobraX > 1) {
      pagina.drawRectangle({
        x: fotoBox.x - sobraX,
        y: fotoBox.y - 1,
        width: sobraX,
        height: fotoBox.altura + 2,
        color: BRANCO,
      });
      pagina.drawRectangle({
        x: fotoBox.x + fotoBox.largura,
        y: fotoBox.y - 1,
        width: sobraX,
        height: fotoBox.altura + 2,
        color: BRANCO,
      });
    }
    if (sobraY > 1) {
      pagina.drawRectangle({
        x: fotoBox.x - 1,
        y: fotoBox.y - sobraY,
        width: fotoBox.largura + 2,
        height: sobraY,
        color: BRANCO,
      });
      pagina.drawRectangle({
        x: fotoBox.x - 1,
        y: fotoBox.y + fotoBox.altura,
        width: fotoBox.largura + 2,
        height: sobraY,
        color: BRANCO,
      });
    }
  }
  const faixa = 30;
  pagina.drawRectangle({ x: x0, y: topoFrente - faixa, width: CARTAO.largura, height: faixa, color: VERDE });
  const titulo = linhas(igreja, negrito, 8.5, CARTAO.largura - 20, 2);
  titulo.forEach((l, i) => {
    const largura = negrito.widthOfTextAtSize(l, 8.5);
    const base = topoFrente - (titulo.length === 1 ? 18 : 12) - i * 10;
    texto(l, x0 + (CARTAO.largura - largura) / 2, base, 8.5, negrito, BRANCO);
  });

  pagina.drawRectangle({
    x: fotoBox.x,
    y: fotoBox.y,
    width: fotoBox.largura,
    height: fotoBox.altura,
    borderColor: CINZA,
    borderWidth: 0.6,
  });
  if (!foto) {
    const semFoto = "sem foto";
    texto(
      semFoto,
      fotoBox.x + (fotoBox.largura - normal.widthOfTextAtSize(semFoto, 7)) / 2,
      fotoBox.y + fotoBox.altura / 2,
      7,
      normal,
      CINZA,
    );
  }

  const xTexto = fotoBox.x + fotoBox.largura + 12;
  const larguraTexto = x0 + CARTAO.largura - 10 - xTexto;
  let y = topoFrente - faixa - 18;
  texto("MEMBRO", xTexto, y, 6.5, normal, CINZA);
  y -= 13;
  for (const l of linhas(c.nome, negrito, 11, larguraTexto, 2)) {
    texto(l, xTexto, y, 11, negrito);
    y -= 13;
  }
  if (c.cargos) {
    y -= 2;
    for (const l of linhas(c.cargos, normal, 8, larguraTexto, 2)) {
      texto(l, xTexto, y, 8, normal, CINZA);
      y -= 10;
    }
  }
  if (c.membroDesde) {
    texto("MEMBRO DESDE", xTexto, yFrente + 30, 6, normal, CINZA);
    texto(formatarData(c.membroDesde), xTexto, yFrente + 19, 9, normal);
  }

  // ------------------------------------------------------------------- verso
  const matriz = qrMatriz(dados.urlVerificacao);
  const qrLado = 92;
  const modulo = qrLado / matriz.length;
  const qrX = x0 + 14;
  const qrY = yVerso + (CARTAO.altura - qrLado) / 2;
  matriz.forEach((linha, li) =>
    linha.forEach((escuro, ci) => {
      if (!escuro) return;
      pagina.drawRectangle({
        x: qrX + ci * modulo,
        y: qrY + qrLado - (li + 1) * modulo,
        // Um fio a mais evita a risca branca entre módulos vizinhos.
        width: modulo + 0.2,
        height: modulo + 0.2,
        color: PRETO,
      });
    }),
  );

  const xVerso = qrX + qrLado + 14;
  const larguraVerso = x0 + CARTAO.largura - 10 - xVerso;
  let yv = yVerso + CARTAO.altura - 24;
  texto("VALIDADE", xVerso, yv, 6.5, normal, CINZA);
  yv -= 13;
  texto(formatarData(c.validade), xVerso, yv, 11, negrito);
  if (c.estado !== "valida") {
    yv -= 11;
    texto(ESTADO_CARTEIRINHA_LABEL[c.estado].toUpperCase(), xVerso, yv, 7, negrito, rgb(0.7, 0.1, 0.1));
  }
  yv -= 18;
  texto("CÓDIGO", xVerso, yv, 6.5, normal, CINZA);
  yv -= 10;
  texto(codigoEmBlocos(c.codigo), xVerso, yv, 7, normal);

  // Assinatura do Pastor.
  const yAss = yVerso + 30;
  pagina.drawLine({
    start: { x: xVerso, y: yAss },
    end: { x: xVerso + larguraVerso, y: yAss },
    thickness: 0.6,
    color: PRETO,
  });
  texto(caber(c.pastor ?? "", negrito, 7, larguraVerso), xVerso, yAss - 9, 7, negrito);
  texto("Pastor", xVerso, yAss - 17, 6.5, normal, CINZA);

  const rodape = "Aponte a câmera para o código e confira a validade.";
  texto(rodape, x0 + (CARTAO.largura - normal.widthOfTextAtSize(rodape, 5.5)) / 2, yVerso + 5, 5.5, normal, CINZA);

  // ------------------------------------------------- contorno (corte) e dobra
  pagina.drawRectangle({
    x: x0,
    y: yVerso,
    width: CARTAO.largura,
    height: CARTAO.altura * 2,
    borderColor: CINZA,
    borderWidth: 0.6,
  });
  pagina.drawLine({
    start: { x: x0, y: yFrente },
    end: { x: x0 + CARTAO.largura, y: yFrente },
    thickness: 0.5,
    color: CINZA,
    dashArray: [3, 3],
  });

  return pdf.save();
}
