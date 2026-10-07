import "server-only";
import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_LABEL, codigoEmBlocos } from "@/lib/carteirinha";
import {
  cargosDaCarteirinha,
  claraDemais,
  corSobre,
  hexParaRgb,
  informacoesDaCarteirinha,
  resolverModelo,
} from "@/lib/carteirinhaModelo";
import { formatChurchName } from "@/lib/churchName";
import { qrMatriz } from "@/lib/qr";
import type { Carteirinha, FotoMembro } from "@/types/carteirinha";

/**
 * Carteirinha de membro em PDF: frente e verso no tamanho de um cartão
 * (85,6 × 54 mm), numa folha A4, um abaixo do outro — recortar, dobrar na
 * linha do meio e plastificar. Segue o modelo da rede (desenho, cores,
 * informações e textos), o mesmo da carteirinha na tela.
 */

const A4 = { largura: 595.28, altura: 841.89 };
/** 85,6 × 54 mm em pontos. */
const CARTAO = { largura: 242.65, altura: 153.07 };
const CINZA = rgb(0.4, 0.4, 0.4);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0, 0, 0);

const cor = (hex: string): RGB => {
  const [r, g, b] = hexParaRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
};

/** A fonte padrão do PDF só tem Latin-1: troca o que tem equivalente e descarta o resto. */
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
  /** Logo da igreja (PNG ou JPEG), ou null. */
  logo: FotoMembro | null;
  /** Endereço que o QR Code abre. */
  urlVerificacao: string;
}): Promise<Uint8Array> {
  const { carteirinha: c, foto } = dados;
  const m = resolverModelo(c.modelo);
  const primaria = cor(m.corPrimaria);
  const sobre = cor(corSobre(m.corPrimaria));
  // Cor clara demais não serve para escrever no branco: cai num cinza escuro.
  const tinta = claraDemais(m.corPrimaria) ? rgb(0.22, 0.25, 0.32) : primaria;
  const rotulo = claraDemais(m.corDestaque) ? CINZA : cor(m.corDestaque);

  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`Carteirinha de membro - ${c.nome}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagina: PDFPage = pdf.addPage([A4.largura, A4.altura]);
  const igreja = formatChurchName(c.igreja, c.igrejaSobrenome);
  const logo = dados.logo
    ? dados.logo.tipo === "image/png"
      ? await pdf.embedPng(dados.logo.bytes)
      : await pdf.embedJpg(dados.logo.bytes)
    : null;

  const x0 = (A4.largura - CARTAO.largura) / 2;
  const x1 = x0 + CARTAO.largura;
  const topoFrente = A4.altura - 110;
  const yFrente = topoFrente - CARTAO.altura;
  // O verso encosta na frente: a linha entre os dois é a dobra.
  const yVerso = yFrente - CARTAO.altura;

  const texto = (t: string, x: number, y: number, tamanho: number, fonte = normal, corTexto: RGB = PRETO) =>
    pagina.drawText(limpo(t), { x, y, size: tamanho, font: fonte, color: corTexto });
  const centro = (t: string, y: number, tamanho: number, fonte: PDFFont, corTexto: RGB, de = x0, ate = x1) =>
    texto(t, de + (ate - de - fonte.widthOfTextAtSize(limpo(t), tamanho)) / 2, y, tamanho, fonte, corTexto);

  /** A logo inteira dentro de um quadrado branco de lado `lado` (a logo pode ser transparente). */
  function desenharLogo(x: number, y: number, lado: number) {
    if (!logo) return;
    pagina.drawRectangle({ x, y, width: lado, height: lado, color: BRANCO });
    const escala = Math.min((lado - 3) / logo.width, (lado - 3) / logo.height);
    const w = logo.width * escala;
    const h = logo.height * escala;
    pagina.drawImage(logo, { x: x + (lado - w) / 2, y: y + (lado - h) / 2, width: w, height: h });
  }

  // Instrução, fora da área de corte.
  centro("Recorte pela linha de fora, dobre na linha do meio e plastifique.", topoFrente + 18, 9, normal, CINZA);

  // ------------------------------------------------------------------ frente
  // Onde ficam a foto e o texto, conforme o desenho.
  const faixaTopo = m.layout === "classico" ? 30 : m.layout === "minimalista" ? 5 : 0;
  const colunaLateral = m.layout === "lateral" ? 92 : 0;
  if (m.layout === "classico" || m.layout === "minimalista") {
    pagina.drawRectangle({
      x: x0,
      y: topoFrente - faixaTopo,
      width: CARTAO.largura,
      height: faixaTopo,
      color: primaria,
    });
  }
  if (m.layout === "lateral") {
    pagina.drawRectangle({ x: x0, y: yFrente, width: colunaLateral, height: CARTAO.altura, color: primaria });
  }
  if (m.layout === "classico") {
    // Com logo: ela fica à esquerda na faixa e o nome se centraliza no espaço que sobra.
    const ladoLogo = 22;
    const de = logo ? x0 + 8 + ladoLogo + 4 : x0;
    desenharLogo(x0 + 8, topoFrente - faixaTopo + (faixaTopo - ladoLogo) / 2, ladoLogo);
    const nomeIgreja = linhas(igreja, negrito, 8.5, x1 - de - 10, 2);
    nomeIgreja.forEach((l, i) =>
      centro(l, topoFrente - (nomeIgreja.length === 1 ? 18 : 12) - i * 10, 8.5, negrito, sobre, de, x1),
    );
  }

  const fotoBox =
    m.layout === "lateral"
      ? { x: x0 + 12, y: yFrente + (CARTAO.altura - 88) / 2, largura: 68, altura: 88 }
      : { x: x0 + 12, y: yFrente + 14, largura: 70, altura: Math.min(92, CARTAO.altura - faixaTopo - 28) };
  pagina.drawRectangle({
    x: fotoBox.x,
    y: fotoBox.y,
    width: fotoBox.largura,
    height: fotoBox.altura,
    color: rgb(0.95, 0.95, 0.95),
  });
  if (foto) {
    const imagem = foto.tipo === "image/png" ? await pdf.embedPng(foto.bytes) : await pdf.embedJpg(foto.bytes);
    // Preenche a moldura sem distorcer: escala pelo lado que sobra menos, centraliza e recorta na moldura.
    const escala = Math.max(fotoBox.largura / imagem.width, fotoBox.altura / imagem.height);
    const w = imagem.width * escala;
    const h = imagem.height * escala;
    pagina.pushOperators(
      pushGraphicsState(),
      rectangle(fotoBox.x, fotoBox.y, fotoBox.largura, fotoBox.altura),
      clip(),
      endPath(),
    );
    pagina.drawImage(imagem, {
      x: fotoBox.x + (fotoBox.largura - w) / 2,
      y: fotoBox.y + (fotoBox.altura - h) / 2,
      width: w,
      height: h,
    });
    pagina.pushOperators(popGraphicsState());
  } else {
    centro("sem foto", fotoBox.y + fotoBox.altura / 2, 7, normal, CINZA, fotoBox.x, fotoBox.x + fotoBox.largura);
  }
  pagina.drawRectangle({
    x: fotoBox.x,
    y: fotoBox.y,
    width: fotoBox.largura,
    height: fotoBox.altura,
    borderColor: m.layout === "lateral" ? BRANCO : CINZA,
    borderWidth: m.layout === "lateral" ? 1.2 : 0.6,
  });

  const xTexto = (m.layout === "lateral" ? x0 + colunaLateral : fotoBox.x + fotoBox.largura) + 12;
  const larguraTexto = x1 - 10 - xTexto;
  let y = topoFrente - faixaTopo - 16;
  if (m.layout !== "classico") {
    // Com logo: ela fica antes do nome da igreja, que ocupa até duas linhas ao lado dela.
    const ladoLogo = 18;
    const recuo = logo ? ladoLogo + 5 : 0;
    const nomeIgreja = linhas(igreja, negrito, 8, larguraTexto - recuo, 2);
    desenharLogo(xTexto, y - ladoLogo + 9, ladoLogo);
    // Uma linha só, ao lado da logo: centraliza na altura dela.
    if (logo && nomeIgreja.length === 1) y -= 4;
    for (const l of nomeIgreja) {
      texto(l, xTexto + recuo, y, 8, negrito, tinta);
      y -= 9.5;
    }
    if (logo) y = Math.min(y, topoFrente - faixaTopo - 16 - ladoLogo + 4);
    y -= 1;
  }
  texto(caber(m.titulo.toUpperCase(), negrito, 6.5, larguraTexto), xTexto, y, 6.5, negrito, rotulo);
  y -= 13;
  for (const l of linhas(c.nome, negrito, 11, larguraTexto, 2)) {
    texto(l, xTexto, y, 11, negrito);
    y -= 12.5;
  }
  const cargos = cargosDaCarteirinha(c, m);
  if (cargos) {
    y -= 1;
    texto(caber(cargos, normal, 7.5, larguraTexto), xTexto, y, 7.5, normal, CINZA);
  }
  // Informações em duas colunas, de baixo para cima: até duas linhas de pares.
  const informacoes = informacoesDaCarteirinha(c, m).slice(0, 4);
  const coluna = larguraTexto / 2;
  informacoes.forEach((info, i) => {
    const linha = Math.floor(i / 2);
    const fileiras = Math.ceil(informacoes.length / 2);
    const base = yFrente + 12 + (fileiras - 1 - linha) * 21;
    const x = xTexto + (i % 2) * coluna;
    texto(caber(info.rotulo.toUpperCase(), normal, 5.5, coluna - 4), x, base + 9, 5.5, normal, rotulo);
    texto(caber(info.valor, normal, 8, coluna - 4), x, base, 8, normal);
  });

  // ------------------------------------------------------------------- verso
  const faixaRodape = 13;
  const versoTexto = m.textoVerso ? linhas(m.textoVerso, normal, 5.8, CARTAO.largura - 24, 2) : [];
  const qrLado = versoTexto.length > 0 ? 82 : 92;
  const matriz = qrMatriz(dados.urlVerificacao);
  const modulo = qrLado / matriz.length;
  const qrX = x0 + 14;
  const qrY = yVerso + CARTAO.altura - 12 - qrLado;
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
  const larguraVerso = x1 - 10 - xVerso;
  let yv = yVerso + CARTAO.altura - 22;
  texto("VALIDADE", xVerso, yv, 6.5, normal, rotulo);
  yv -= 13;
  texto(formatarData(c.validade), xVerso, yv, 11, negrito);
  if (c.estado !== "valida") {
    yv -= 10;
    texto(ESTADO_CARTEIRINHA_LABEL[c.estado].toUpperCase(), xVerso, yv, 7, negrito, rgb(0.7, 0.1, 0.1));
  }
  yv -= 15;
  texto("CÓDIGO", xVerso, yv, 6.5, normal, rotulo);
  yv -= 9;
  texto(codigoEmBlocos(c.codigo), xVerso, yv, 6.8, normal);

  // Assinatura do Pastor, alinhada com a base do QR Code.
  const yAss = qrY + 16;
  pagina.drawLine({
    start: { x: xVerso, y: yAss },
    end: { x: xVerso + larguraVerso, y: yAss },
    thickness: 0.6,
    color: PRETO,
  });
  texto(caber(c.pastor ?? "", negrito, 7, larguraVerso), xVerso, yAss - 8.5, 7, negrito);
  texto("Pastor", xVerso, yAss - 16, 6.2, normal, CINZA);

  versoTexto.forEach((l, i) => centro(l, qrY - 10 - i * 7, 5.8, normal, CINZA));

  // Rodapé: o texto da igreja, ou a dica de como conferir.
  const rodape = caber(
    m.rodape ?? "Aponte a câmera para o código e confira a validade.",
    normal,
    6,
    CARTAO.largura - 16,
  );
  if (m.layout === "minimalista") {
    pagina.drawLine({
      start: { x: x0 + 12, y: yVerso + faixaRodape },
      end: { x: x1 - 12, y: yVerso + faixaRodape },
      thickness: 0.6,
      color: tinta,
    });
    centro(rodape, yVerso + 4.5, 6, normal, m.rodape ? tinta : CINZA);
  } else {
    pagina.drawRectangle({ x: x0, y: yVerso, width: CARTAO.largura, height: faixaRodape, color: primaria });
    centro(rodape, yVerso + 4.5, 6, m.rodape ? negrito : normal, sobre);
  }

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
    end: { x: x1, y: yFrente },
    thickness: 0.5,
    color: CINZA,
    dashArray: [3, 3],
  });

  return pdf.save();
}
