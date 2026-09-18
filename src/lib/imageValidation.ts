/**
 * Identificação de imagem pelos bytes do arquivo, não pelo que o cliente diz.
 *
 * O `Content-Type` do upload e a extensão do nome são escolhidos por quem
 * envia: aceitar qualquer um dos dois é aceitar o que a pessoa quiser. Aqui a
 * decisão sai da assinatura binária.
 *
 * SVG não entra na lista de propósito. É XML com script, e um bucket público
 * serve o arquivo na própria origem — abrir a URL direto executaria o
 * conteúdo. PNG, JPEG e WebP cobrem qualquer logo real.
 */

export type ImagemAceita = "image/png" | "image/jpeg" | "image/webp";

/** 1MB: logo de rodapé não precisa de mais, e o bucket repete o teto. */
export const MAX_LOGO_BYTES = 1024 * 1024;

export const EXTENSAO_POR_TIPO: Record<ImagemAceita, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function comecaCom(bytes: Uint8Array, assinatura: number[], offset = 0): boolean {
  if (bytes.length < offset + assinatura.length) return false;
  return assinatura.every((valor, i) => bytes[offset + i] === valor);
}

/** Devolve o tipo real do arquivo, ou null se não for imagem que aceitamos. */
export function sniffImageType(bytes: Uint8Array): ImagemAceita | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (comecaCom(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // WebP: "RIFF" .... "WEBP" — o tamanho fica entre os dois.
  if (comecaCom(bytes, [0x52, 0x49, 0x46, 0x46]) && comecaCom(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
