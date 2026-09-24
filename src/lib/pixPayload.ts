/**
 * BR Code do PIX ("copia e cola"), o texto que vira QR Code na página da
 * igreja. Especificação do Banco Central (EMV® QRCPS-MPM).
 *
 * O dinheiro NÃO passa pela plataforma: o código aponta para a chave da
 * própria igreja, e quem doa paga direto do banco dele para o dela. O nome do
 * titular vai junto porque é o que o app do banco mostra antes de confirmar —
 * é comparando esse nome que quem doa percebe uma chave trocada.
 *
 * Dízimo e oferta (o uso original deste arquivo) não têm valor nem txid
 * fixo: quem doa escolhe o valor, e um txid repetido faria bancos tratarem
 * doações diferentes como a mesma cobrança. Campanha é o caso contrário — o
 * valor É fixo (quem doa escolheu antes, na tela) e vale embuti-lo: o app do
 * banco já mostra o valor certo, sem digitação manual. Por isso os dois
 * campos abaixo são opcionais: ausentes, o payload sai como sempre saiu.
 */

/** Um campo EMV: id + tamanho com 2 dígitos + valor. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/**
 * CRC16/CCITT-FALSE, exigido no fim do BR Code. Sem ele (ou errado), o app do
 * banco recusa o código inteiro.
 */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * O BR Code é ASCII: acento vira letra sem acento, e o que sobra fora da
 * tabela sai. "São" -> "SAO".
 */
function ascii(texto: string, limite: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, limite);
}

export interface PixPayloadInput {
  /** Chave PIX da igreja, como ela cadastrou. */
  chave: string;
  /** Titular da chave: é o nome que aparece no app de quem doa. */
  titular: string;
  /** Cidade do recebedor. O padrão serve quando a igreja não informou. */
  cidade?: string;
  /** Valor fixo, em centavos. Ausente = quem doa escolhe (campo 54 de fora). */
  valorCents?: number;
  /**
   * Identificador da cobrança (campo 62/05), até 25 caracteres alfanuméricos.
   * Ausente = "***" (o padrão do BR Code para "sem txid"). É o que deixa a
   * igreja achar, no extrato, a qual doação um PIX recebido corresponde.
   */
  txid?: string;
}

/** Só alfanumérico, maiúsculo, até 25 — é o que o campo 62/05 aceita. */
function sanitizarTxid(txid: string): string {
  return txid.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 25);
}

/** Monta o "copia e cola". */
export function buildPixPayload({ chave, titular, cidade, valorCents, txid }: PixPayloadInput): string {
  const chaveLimpa = chave.trim();
  const merchant = campo("00", "br.gov.bcb.pix") + campo("01", chaveLimpa);
  const txidLimpo = txid ? sanitizarTxid(txid) : "";

  const semCrc =
    campo("00", "01") +
    campo("26", merchant) +
    campo("52", "0000") +
    campo("53", "986") +
    (valorCents ? campo("54", (valorCents / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", ascii(titular, 25) || "RECEBEDOR") +
    campo("60", ascii(cidade ?? "CIDADE", 15) || "CIDADE") +
    campo("62", campo("05", txidLimpo || "***")) +
    "6304";

  return semCrc + crc16(semCrc);
}
