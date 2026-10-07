/**
 * Termos de Uso editados pelo painel da plataforma. Regras puras (sem I/O)
 * sobre o TEXTO: a linha de versão e os campos que ficaram por preencher.
 */

export const PUBLICOS_DOS_TERMOS = ["igreja", "patrocinador"] as const;
export type PublicoDosTermos = (typeof PUBLICOS_DOS_TERMOS)[number];

export const NOME_DO_PUBLICO: Record<PublicoDosTermos, string> = {
  igreja: "Igrejas",
  patrocinador: "Patrocinadores",
};

/** Um contrato não cabe em menos que isso; e o limite de cima segura colagem acidental. */
export const TERMOS_MIN_CARACTERES = 200;
export const TERMOS_MAX_CARACTERES = 200_000;

export function isPublicoDosTermos(valor: string): valor is PublicoDosTermos {
  return (PUBLICOS_DOS_TERMOS as readonly string[]).includes(valor);
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-10-07" → "7 de outubro de 2026". */
export function dataPorExtenso(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

const LINHA_DA_VERSAO = /^\*\*Versão \d+ — vigente desde .+?\*\*[ \t]*$/m;

/**
 * Acerta a linha "**Versão N — vigente desde …**" do documento com o número
 * e a data da publicação — quem edita não precisa lembrar de mudá-la, e o
 * texto nunca diz uma versão diferente da que o banco registrou. Documento
 * sem essa linha fica como está.
 */
export function carimbarVersao(conteudo: string, versao: number, dataISO: string): string {
  return conteudo.replace(LINHA_DA_VERSAO, `**Versão ${versao} — vigente desde ${dataPorExtenso(dataISO)}**`);
}

/**
 * Campos de modelo que ficaram no texto, como "[RAZÃO SOCIAL]": colchetes só
 * com maiúsculas. Um link ("[texto](destino)") não entra.
 */
export function camposPorPreencher(conteudo: string): string[] {
  const achados = conteudo.match(/\[[A-ZÀ-Ý][A-ZÀ-Ý0-9 ()/.-]{2,}\](?!\()/g) ?? [];
  return [...new Set(achados)];
}
