/**
 * Caminhos da área do patrocinador (sem I/O).
 */

export const SPONSOR_HOME = "/patrocinador";

/**
 * Destino pós-login/cadastro, restrito à própria área. Qualquer coisa fora
 * disso (URL absoluta, "//host", barra invertida) vira o painel — sem open
 * redirect.
 */
export function safeSponsorPath(value: unknown): string {
  if (typeof value !== "string") return SPONSOR_HOME;
  if (value.startsWith("//") || value.includes("\\")) return SPONSOR_HOME;
  const path = value.split(/[?#]/)[0];
  if (path !== SPONSOR_HOME && !path.startsWith(`${SPONSOR_HOME}/`)) return SPONSOR_HOME;
  return value;
}

export function sponsorshipPath(publicCode: string): string {
  return `${SPONSOR_HOME}/patrocinar/${encodeURIComponent(publicCode)}`;
}
