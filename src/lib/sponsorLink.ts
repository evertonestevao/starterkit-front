/**
 * Link do patrocinador (sem I/O): o destino de quem clica na logo dele na
 * página pública da igreja. A pessoa digita UM campo, que pode ser um site ou
 * um número de WhatsApp; aqui se decide qual dos dois é e se monta o link.
 *
 * O que é guardado é o par (tipo, valor) — nunca um href pronto. Assim o
 * endereço do WhatsApp é sempre montado por nós (`wa.me`), e o banco só
 * aceita `http(s)://` no tipo "link": nada de `javascript:` numa página que
 * a igreja divulga.
 */

export type SponsorLinkKind = "link" | "whatsapp";

export interface SponsorLink {
  tipo: SponsorLinkKind;
  valor: string;
}

export const SPONSOR_LINK_MAX_LENGTH = 300;

export type ParsedSponsorLink =
  | { ok: true; link: SponsorLink | null }
  | { ok: false; message: string };

const MENSAGEM_LINK = "Informe um site válido (ex.: https://meusite.com.br) ou um WhatsApp com DDD.";
const MENSAGEM_WHATSAPP = "WhatsApp inválido: use o DDD e o número (ex.: (11) 91234-5678).";

/** Só dígitos e a pontuação comum de telefone: é número, não endereço. */
function pareceTelefone(texto: string): boolean {
  return /^\+?[\d\s().-]+$/.test(texto) && /\d/.test(texto);
}

function normalizarWhatsapp(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  // Sem código do país: assume Brasil (DDD + 8 ou 9 dígitos).
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

function normalizarLink(texto: string): string | null {
  if (/\s/.test(texto)) return null;
  // Esquema explícito só pode ser http(s); "meusite.com.br" ganha https://.
  const temEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto);
  if (temEsquema && !/^https?:\/\//i.test(texto)) return null;
  const comEsquema = temEsquema ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // `https://banco.com@site-malicioso.com` engana quem lê só o começo.
  if (url.username || url.password) return null;
  // Precisa de um domínio de verdade: "localhost" e IPs não servem a um negócio.
  if (!url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname)) return null;

  const final = url.toString();
  return final.length <= SPONSOR_LINK_MAX_LENGTH ? final : null;
}

/**
 * Interpreta o campo. Vazio significa "sem link" (`link: null`), que é como
 * a pessoa remove o que tinha.
 */
export function parseSponsorLink(input: string): ParsedSponsorLink {
  const texto = input.trim();
  if (texto === "") return { ok: true, link: null };

  if (pareceTelefone(texto)) {
    const valor = normalizarWhatsapp(texto);
    return valor
      ? { ok: true, link: { tipo: "whatsapp", valor } }
      : { ok: false, message: MENSAGEM_WHATSAPP };
  }

  const valor = normalizarLink(texto);
  return valor ? { ok: true, link: { tipo: "link", valor } } : { ok: false, message: MENSAGEM_LINK };
}

/**
 * Mensagem que já vem escrita quando alguém abre o WhatsApp pela página de
 * uma igreja: quem recebe sabe de onde o contato veio.
 *
 * É a MESMA para toda igreja, de propósito. Com o nome da igreja, o
 * patrocinador veria qual página traz retorno e poderia cancelar o apoio às
 * outras.
 */
export const WHATSAPP_GREETING =
  "Olá! Encontrei seu contato na página da igreja e gostaria de saber mais.";

/**
 * Para onde a logo aponta. `null` = a logo não é clicável.
 *
 * Com `comMensagem`, o link do WhatsApp abre com a mensagem de apresentação
 * já digitada. Site não muda. Sem a opção (painel, moderação) o link é o
 * `wa.me` puro, que é o que se quer conferir.
 */
export function sponsorLinkHref(
  link: { tipo: string | null; valor: string | null },
  opcoes?: { comMensagem?: boolean },
): string | null {
  if (!link.tipo || !link.valor) return null;
  if (link.tipo === "whatsapp") {
    if (!/^\d{10,15}$/.test(link.valor)) return null;
    const base = `https://wa.me/${link.valor}`;
    return opcoes?.comMensagem ? `${base}?text=${encodeURIComponent(WHATSAPP_GREETING)}` : base;
  }
  if (link.tipo === "link") return /^https?:\/\//i.test(link.valor) ? link.valor : null;
  return null;
}

/** Como o valor guardado volta para o campo de edição. */
export function sponsorLinkToInput(link: { tipo: string | null; valor: string | null }): string {
  if (!link.tipo || !link.valor) return "";
  if (link.tipo !== "whatsapp") return link.valor;
  const local = link.valor.startsWith("55") ? link.valor.slice(2) : link.valor;
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);
  const corte = numero.length - 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** Igualdade entre dois pares guardados (ambos nulos = sem link). */
export function sameSponsorLink(a: SponsorLink | null, b: SponsorLink | null): boolean {
  return (a?.tipo ?? null) === (b?.tipo ?? null) && (a?.valor ?? null) === (b?.valor ?? null);
}
