/**
 * Regras puras da página pública da igreja: o que mostrar e em que ordem.
 *
 * A regra de ouro desta página: campo vazio NÃO aparece. Nada de valor
 * inventado para "preencher" — a versão anterior mostrava um endereço fixo
 * de outra cidade e links sociais apontando para "#", e um visitante não tem
 * como saber que aquilo é enfeite.
 */

const DIAS = [
  { chave: "domingo", rotulo: "Domingo" },
  { chave: "segunda", rotulo: "Segunda" },
  { chave: "terca", rotulo: "Terça" },
  { chave: "quarta", rotulo: "Quarta" },
  { chave: "quinta", rotulo: "Quinta" },
  { chave: "sexta", rotulo: "Sexta" },
  { chave: "sabado", rotulo: "Sábado" },
] as const;

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function capitaliza(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export interface ServiceTime {
  dia: string;
  horario: string;
}

/**
 * Horários de culto em ordem de semana (domingo primeiro), com o nome do dia
 * escrito direito. Aceita "quarta", "Quarta-feira", "terca" ou "terça".
 * Chave que não é dia da semana ("Santa Ceia") entra no fim, como veio.
 */
export function orderServiceTimes(raw: unknown): ServiceTime[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const itens = Object.entries(raw as Record<string, unknown>)
    .map(([chave, valor]) => ({ chave, horario: String(valor ?? "").trim() }))
    .filter((item) => item.horario !== "" && item.chave.trim() !== "");

  return itens
    .map((item) => {
      const normalizada = semAcento(item.chave).replace(/-?feira$/, "");
      const indice = DIAS.findIndex((d) => normalizada.startsWith(d.chave));
      return {
        ordem: indice === -1 ? DIAS.length : indice,
        dia: indice === -1 ? capitaliza(item.chave.trim()) : DIAS[indice].rotulo,
        horario: item.horario,
      };
    })
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ dia, horario }) => ({ dia, horario }));
}

export type SocialKind = "instagram" | "whatsapp" | "youtube" | "facebook" | "site";

export interface SocialLink {
  kind: SocialKind;
  rotulo: string;
  href: string;
}

const ROTULOS: Record<SocialKind, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  facebook: "Facebook",
  site: "Site",
};

/** Só http(s). `javascript:` num href executaria código de quem visita. */
function urlSegura(valor: string): string | null {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tipoDaChave(chave: string): SocialKind | null {
  const k = semAcento(chave);
  if (k.includes("insta")) return "instagram";
  if (k.includes("whats") || k === "zap") return "whatsapp";
  if (k.includes("youtube") || k === "yt") return "youtube";
  if (k.includes("face")) return "facebook";
  if (k === "site" || k === "website" || k === "web") return "site";
  return null;
}

function hrefDe(kind: SocialKind, valor: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(valor)) return urlSegura(valor);

  if (kind === "whatsapp") {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13) return null;
    // Número nacional (DDD + número) ganha o 55; quem já mandou com país fica.
    const completo = digitos.length <= 11 ? `55${digitos}` : digitos;
    return `https://wa.me/${completo}`;
  }
  if (kind === "instagram") {
    const usuario = valor.replace(/^@/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? `https://instagram.com/${usuario}` : null;
  }
  // Sem esquema e com cara de domínio: "igrejax.com.br".
  if (/^[^\s/]+\.[^\s/]+/.test(valor)) return urlSegura(`https://${valor}`);
  return null;
}

/**
 * Redes sociais que dá para abrir de verdade. Chave desconhecida ou valor que
 * não vira link válido é descartado — melhor faltar um botão do que ter um
 * botão que não leva a lugar nenhum.
 */
export function normalizeSocialLinks(raw: unknown): SocialLink[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const vistos = new Set<SocialKind>();
  const links: SocialLink[] = [];
  for (const [chave, valorBruto] of Object.entries(raw as Record<string, unknown>)) {
    const kind = tipoDaChave(chave);
    const valor = typeof valorBruto === "string" ? valorBruto.trim() : "";
    if (!kind || !valor || vistos.has(kind)) continue;
    const href = hrefDe(kind, valor);
    if (!href) continue;
    vistos.add(kind);
    links.push({ kind, rotulo: ROTULOS[kind], href });
  }
  return links;
}

/** Link "Como chegar". O nome da igreja ajuda o mapa quando falta a cidade. */
export function directionsUrl(churchName: string, address: string | null): string | null {
  const endereco = address?.trim();
  if (!endereco) return null;
  const consulta = encodeURIComponent(`${churchName}, ${endereco}`);
  return `https://www.google.com/maps/search/?api=1&query=${consulta}`;
}

const PALAVRAS_GENERICAS = new Set([
  "igreja", "comunidade", "ministerio", "assembleia", "templo", "de", "da", "do", "das", "dos", "e",
]);

/** Monograma do cabeçalho quando a igreja não tem logo: "Igreja Vida Nova" → "VN". */
export function churchInitials(nome: string): string {
  const palavras = nome.split(/\s+/).filter(Boolean);
  const fortes = palavras.filter((p) => !PALAVRAS_GENERICAS.has(semAcento(p)));
  const base = fortes.length > 0 ? fortes : palavras;
  return base
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
