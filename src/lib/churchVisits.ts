/**
 * Regras puras da contagem de visitas à página pública da igreja.
 *
 * A origem vem de um parâmetro na URL impressa: o QR Code aponta para
 * `/igreja/{codigo}?origem=qr` e a tag NFC para `?origem=nfc`. Sem o
 * parâmetro, a visita conta como `link` — inclusive QR/NFC impressos antes
 * de existir a marcação.
 */

export const VISIT_ORIGINS = ["link", "qr", "nfc"] as const;
export type VisitOrigin = (typeof VISIT_ORIGINS)[number];

/** Nome do parâmetro de origem nas URLs de QR e NFC. */
export const VISIT_ORIGIN_PARAM = "origem";

export function parseVisitOrigin(value: string | string[] | undefined): VisitOrigin {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  return raw === "qr" || raw === "nfc" ? raw : "link";
}

/** URL que vai impressa no QR Code ou gravada na tag NFC. */
export function churchTagUrl(appUrl: string, publicCode: string, origem: "qr" | "nfc"): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/igreja/${encodeURIComponent(publicCode)}?${VISIT_ORIGIN_PARAM}=${origem}`;
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|headless|lighthouse|curl|wget|python-requests|axios|node-fetch/i;

/**
 * Pedido que não é uma pessoa abrindo a página: robô de busca, gerador de
 * prévia de link (o WhatsApp abre a página para montar o cartão), ou
 * pré-carregamento do navegador/Next. Nenhum deles conta.
 */
export function isAutomatedVisit(input: {
  userAgent: string | null;
  purpose: string | null;
  nextPrefetch: string | null;
}): boolean {
  if (!input.userAgent) return true;
  if (input.nextPrefetch) return true;
  if (input.purpose && /prefetch|prerender/i.test(input.purpose)) return true;
  return BOT_PATTERN.test(input.userAgent);
}
