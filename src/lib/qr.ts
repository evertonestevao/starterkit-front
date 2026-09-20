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
