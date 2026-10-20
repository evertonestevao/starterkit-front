import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData, formatarPercentual, percentualPresenca } from "@/lib/acompanhamento";
import { formatarReais, totaisDoDia } from "@/lib/ebd";
import type { EbdResumoClasse } from "@/types/ebd";

/**
 * Relatório do domingo da EBD em PDF (A4), gerado no servidor para o botão
 * "Baixar PDF" entregar o arquivo direto — sem passar pela janela de
 * impressão do navegador. Mesmos números do Resumo.
 *
 * Fonte padrão do PDF (Helvetica): cobre os acentos do português, mas não
 * emoji nem símbolos fora do Latin-1 — por isso `limpo()` nos textos livres.
 */

export interface RelatorioDomingoPdf {
  igreja: string;
  /** YYYY-MM-DD. */
  data: string;
  trimestre: string | null;
  linhas: EbdResumoClasse[];
  /** Professores por classe (classeId → "Ana, Paulo"). */
  professores: Record<string, string>;
}

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.6, 0.6, 0.6);
const FUNDO = rgb(0.94, 0.94, 0.94);

/** Tira o que a fonte padrão não desenha (emoji etc.), para não quebrar a geração. */
function limpo(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

/** Corta o texto para caber na largura, com reticências. */
function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = limpo(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

const COLUNAS = [
  { titulo: "Classe", largura: 136, direita: false },
  { titulo: "Matr.", largura: 36, direita: true },
  { titulo: "Pres.", largura: 36, direita: true },
  { titulo: "Aus.", largura: 36, direita: true },
  { titulo: "Just.", largura: 36, direita: true },
  { titulo: "Presença", largura: 52, direita: true },
  { titulo: "Visit.", largura: 36, direita: true },
  { titulo: "Bíblias", largura: 40, direita: true },
  { titulo: "Revistas", largura: 48, direita: true },
  { titulo: "Oferta", largura: 0, direita: true }, // o que sobrar
];

export async function gerarRelatorioDomingoPdf(dados: RelatorioDomingoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpo(`EBD - ${dados.igreja} - ${formatarData(dados.data)}`));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const util = A4.largura - MARGEM * 2;
  const larguras = COLUNAS.map((c) => c.largura);
  larguras[larguras.length - 1] = util - larguras.reduce((s, l) => s + l, 0);

  let pagina: PDFPage = pdf.addPage([A4.largura, A4.altura]);
  let y = A4.altura - MARGEM;

  const texto = (t: string, x: number, yy: number, tamanho: number, fonte = normal, cor = rgb(0, 0, 0)) =>
    pagina.drawText(limpo(t), { x, y: yy, size: tamanho, font: fonte, color: cor });

  /** Uma linha da tabela: células com borda; a primeira coluna aceita 2ª e 3ª linhas pequenas. */
  function linhaTabela(celulas: string[], opcoes: { destaque?: boolean; sub?: string[]; unida?: string } = {}) {
    const sub = opcoes.sub ?? [];
    const altura = 20 + sub.length * 10;
    if (y - altura < MARGEM + 70) {
      pagina = pdf.addPage([A4.largura, A4.altura]);
      y = A4.altura - MARGEM;
    }
    if (opcoes.destaque) {
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: util, height: altura, color: FUNDO });
    }
    const fonte = opcoes.destaque ? negrito : normal;
    let x = MARGEM;
    COLUNAS.forEach((col, i) => {
      // "unida": as colunas de número viram uma só (ex.: "chamada não feita").
      const unir = opcoes.unida !== undefined && i >= 2;
      if (!unir || i === 2) {
        const largura = unir ? larguras.slice(2).reduce((s, l) => s + l, 0) : larguras[i];
        pagina.drawRectangle({ x, y: y - altura, width: largura, height: altura, borderColor: LINHA, borderWidth: 0.5 });
        if (unir) {
          const t = opcoes.unida as string;
          texto(t, x + (largura - normal.widthOfTextAtSize(limpo(t), 9)) / 2, y - 13, 9, normal, CINZA);
        } else {
          const t = caber(celulas[i] ?? "", fonte, 9, largura - 8);
          const tx = col.direita ? x + largura - 4 - fonte.widthOfTextAtSize(t, 9) : x + 4;
          texto(t, tx, y - 13, 9, i === 0 && !opcoes.destaque ? negrito : fonte);
          if (i === 0) {
            sub.forEach((s, n) => texto(caber(s, normal, 7.5, largura - 8), x + 4, y - 23 - n * 10, 7.5, normal, CINZA));
          }
        }
      }
      x += larguras[i];
    });
    y -= altura;
  }

  // Cabeçalho
  texto("ESCOLA BÍBLICA DOMINICAL", MARGEM, y - 8, 8, normal, CINZA);
  texto(caber(dados.igreja, negrito, 18, util), MARGEM, y - 30, 18, negrito);
  texto(
    `Relatório do domingo ${formatarData(dados.data)}${dados.trimestre ? ` · ${dados.trimestre}` : ""}`,
    MARGEM,
    y - 48,
    10,
  );
  y -= 58;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + util, y }, thickness: 0.7, color: LINHA });
  y -= 14;

  if (dados.linhas.length === 0) {
    texto("Nenhuma classe ativa.", MARGEM, y - 10, 10);
    y -= 24;
  } else {
    linhaTabela(
      COLUNAS.map((c) => c.titulo),
      { destaque: true },
    );
    for (const r of dados.linhas) {
      const sub = [
        dados.professores[r.classeId] ? `Prof.: ${dados.professores[r.classeId]}` : "",
        r.licao ? `Lição: ${r.licao}` : "",
      ].filter(Boolean);
      if (r.chamadaFeita) {
        linhaTabela(
          [
            r.classeNome,
            String(r.matriculados),
            String(r.presentes),
            String(r.ausentes),
            String(r.justificados),
            formatarPercentual(percentualPresenca(r.presentes, r.ausentes)),
            String(r.visitantes),
            String(r.biblias),
            String(r.revistas),
            formatarReais(r.ofertaCentavos),
          ],
          { sub },
        );
      } else {
        linhaTabela([r.classeNome, String(r.matriculados)], { sub, unida: "chamada não feita" });
      }
    }
    const t = totaisDoDia(dados.linhas);
    linhaTabela(
      [
        "Total",
        String(t.matriculados),
        String(t.presentes),
        String(t.ausentes),
        String(t.justificados),
        formatarPercentual(percentualPresenca(t.presentes, t.ausentes)),
        String(t.visitantes),
        String(t.biblias),
        String(t.revistas),
        formatarReais(t.ofertaCentavos),
      ],
      { destaque: true },
    );
    y -= 14;
    texto(
      "Matr. = Matriculados · Pres. = Presentes · Aus. = Ausentes · Just. = Justificados · Visit. = Visitantes",
      MARGEM,
      y,
      7.5,
      normal,
      CINZA,
    );
    y -= 11;
    texto(
      `${t.classesComChamada} de ${dados.linhas.length} classe(s) com chamada feita. Presença = presentes ÷ (presentes + ausentes); justificados ficam de fora.`,
      MARGEM,
      y,
      7.5,
      normal,
      CINZA,
    );
  }

  // Assinaturas
  y -= 60;
  const meia = (util - 40) / 2;
  [
    ["Secretaria da EBD", MARGEM],
    ["Superintendente / Pastor", MARGEM + meia + 40],
  ].forEach(([rotulo, x]) => {
    pagina.drawLine({ start: { x: x as number, y }, end: { x: (x as number) + meia, y }, thickness: 0.6, color: LINHA });
    const r = rotulo as string;
    texto(r, (x as number) + (meia - normal.widthOfTextAtSize(limpo(r), 8)) / 2, y - 11, 8, normal, CINZA);
  });

  return pdf.save();
}
