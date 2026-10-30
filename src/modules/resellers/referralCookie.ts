/**
 * Regras puras do link de afiliado (plano §5), sem I/O: formato do código, cookie e
 * destino do redirecionamento. Importável pelo proxy, que não acessa o banco.
 */

export const REFERRAL_COOKIE = "reseller_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Páginas de venda: as únicas que aceitam ?ref= e os únicos destinos de /r/[codigo]. */
export const SALES_PATHS: ReadonlySet<string> = new Set(["/", "/signup"]);
const DEFAULT_SALES_PATH = "/";

const REFERRAL_CODE_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REFERRAL_CODE_MAX_LENGTH = 64;

/** Código no formato do banco, ou null. Lixo nem chega a consultar o banco. */
export function normalizeReferralCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toLowerCase();
  if (code.length > REFERRAL_CODE_MAX_LENGTH || !REFERRAL_CODE_FORMAT.test(code)) return null;
  return code;
}

export function buildReferralCookie(code: string, secure: boolean): string {
  const parts = [
    `${REFERRAL_COOKIE}=${code}`,
    "Path=/",
    `Max-Age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Destino limpo de /r/[codigo]: só caminho interno conhecido (anti open redirect). */
export function buildReferralRedirect(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams);
  const next = params.get("next");
  params.delete("next");
  params.delete("ref");
  const path = next && SALES_PATHS.has(next) ? next : DEFAULT_SALES_PATH;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * ?ref= em página de venda vira /r/[codigo]: um único ponto grava o cookie e limpa a
 * URL, e o proxy continua sem consultar o banco. null quando não se aplica.
 */
export function buildRefRewrite(pathname: string, searchParams: URLSearchParams): string | null {
  const ref = searchParams.get("ref");
  if (ref === null || !SALES_PATHS.has(pathname)) return null;

  const params = new URLSearchParams(searchParams);
  params.delete("ref");
  params.set("next", pathname);
  // Código malformado segue o mesmo caminho: a resposta não muda.
  return `/r/${encodeURIComponent(ref)}?${params.toString()}`;
}
