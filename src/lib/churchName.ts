/**
 * Nome e sobrenome da igreja (sem I/O).
 *
 * O NOME é o que a igreja (ou o ministério dela) se chama — "Assembleia de
 * Deus Ministério no Ipiranga". O SOBRENOME, opcional, é o que a distingue das
 * irmãs de mesmo nome — "Prainha - Promissão". Na página pública o nome vem em
 * cima e o sobrenome logo abaixo, menor; em listas e mensagens, junto.
 */

export const CHURCH_SURNAME_MAX_LENGTH = 120;

/** Sobrenome só com espaços é sobrenome nenhum. */
export function normalizeSurname(value: string | null | undefined): string | null {
  const limpo = (value ?? "").trim().replace(/\s+/g, " ");
  return limpo === "" ? null : limpo;
}

/** "Nome · Sobrenome" para listas e e-mails; só o nome quando não há sobrenome. */
export function formatChurchName(nome: string, sobrenome?: string | null): string {
  const s = normalizeSurname(sobrenome);
  return s ? `${nome} · ${s}` : nome;
}
