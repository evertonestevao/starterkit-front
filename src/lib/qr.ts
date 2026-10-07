import QRCode from "qrcode";

/**
 * Geração de QR Code (lib `qrcode`).
 *
 * Um QR impresso errado só aparece quando o material já está na parede da
 * igreja, então a geração fica num lugar só, com as mesmas opções para todo
 * mundo: correção de erro média (aguenta sujeira e dobra no papel) e margem
 * mínima exigida pela norma, sem a qual leitores erram.
 */

const OPCOES = { errorCorrectionLevel: "M", margin: 2 } as const;

/** PNG em data URL, para <img> e para download direto do navegador. */
export function qrPngDataUrl(texto: string, tamanho = 512): Promise<string> {
  return QRCode.toDataURL(texto, { ...OPCOES, width: tamanho });
}

/** SVG, que escala sem perder nitidez em banner e adesivo grande. */
export function qrSvg(texto: string, tamanho = 512): Promise<string> {
  return QRCode.toString(texto, { ...OPCOES, type: "svg", width: tamanho });
}

/**
 * A matriz do QR (true = módulo escuro), para desenhar onde não cabe imagem —
 * o PDF da carteirinha desenha cada módulo como um quadradinho. Sem a margem:
 * quem desenha deixa o espaço em branco em volta.
 */
export function qrMatriz(texto: string): boolean[][] {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: OPCOES.errorCorrectionLevel });
  const linhas: boolean[][] = [];
  for (let y = 0; y < modules.size; y++) {
    const linha: boolean[] = [];
    for (let x = 0; x < modules.size; x++) linha.push(modules.get(x, y) === 1);
    linhas.push(linha);
  }
  return linhas;
}
