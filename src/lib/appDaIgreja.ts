import { caminhoDaIgreja, partesDaChave } from "@/lib/churchPaths";

/**
 * A página pública de cada igreja como um app instalável, separado do painel:
 * o membro põe na tela inicial um ícone com a logo da igreja, que abre direto
 * na programação dela. Regras puras (sem I/O).
 *
 * Cada igreja tem um `id` de app diferente (o endereço da página), então o
 * navegador a trata como outro aplicativo — dá para ter o painel e a página
 * da igreja instalados no mesmo aparelho.
 */

/** Cor do app quando a igreja não escolheu uma (a mesma do painel). */
export const COR_PADRAO_DO_APP = "#41694b";

/**
 * Onde o app da igreja abre, no endereço que a pessoa está usando:
 * - no endereço da plataforma: /igreja/{codigo} (ou /igreja/{rede}/{codigo});
 * - no domínio próprio da rede: "/" para a sede, /igreja/{codigo} para as de baixo.
 */
export function inicioDoAppDaIgreja(publicCode: string, noDominioProprio: boolean): string {
  if (!noDominioProprio) return caminhoDaIgreja(publicCode);
  const { rede, codigo } = partesDaChave(publicCode);
  return rede ? `/igreja/${codigo}` : "/";
}

/**
 * O endereço de início que chega pela URL do manifesto: precisa ser um
 * caminho deste mesmo site (nada de "//outro-site" nem "https://..."), senão
 * vale o padrão.
 */
export function inicioSeguro(valor: string | null, padrao: string): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || /[\\\s<>"]/.test(valor) || valor.length > 200) {
    return padrao;
  }
  return valor;
}

/** Nome curto para debaixo do ícone (o sistema corta o que passar de ~12 letras). */
export function nomeCurtoDoApp(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length <= 12) return limpo;
  // "Assembleia de Deus Ministério Belém" → "AD Belém" seria adivinhar demais; fica a primeira palavra longa o bastante.
  const palavras = limpo.split(" ").filter((p) => p.length > 2);
  const ultima = palavras.at(-1) ?? limpo;
  return ultima.length <= 12 ? ultima : `${ultima.slice(0, 11)}…`;
}

/** Iniciais para o ícone de quem não tem logo: "Igreja Batista Central" → "IB". */
export function iniciaisDaIgreja(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p));
  const letras = palavras
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return letras || "?";
}

export interface ManifestoDaIgreja {
  nome: string;
  sobrenome: string | null;
  publicCode: string;
  inicio: string;
  cor: string | null;
}

/** O manifesto do app da igreja. Os ícones são gerados por /api/igreja-app/icone. */
export function manifestoDaIgreja(i: ManifestoDaIgreja) {
  const nomeCompleto = i.sobrenome ? `${i.nome} - ${i.sobrenome}` : i.nome;
  const cor = i.cor && /^#[0-9a-f]{6}$/i.test(i.cor) ? i.cor : COR_PADRAO_DO_APP;
  const icone = (tamanho: number, mascara = false) =>
    `/api/igreja-app/icone?c=${encodeURIComponent(i.publicCode)}&t=${tamanho}${mascara ? "&m=1" : ""}`;
  return {
    name: nomeCompleto,
    short_name: nomeCurtoDoApp(i.nome),
    description: `Programação, eventos e contatos de ${nomeCompleto}.`,
    lang: "pt-BR",
    id: i.inicio,
    start_url: i.inicio,
    scope: i.inicio,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: cor,
    icons: [
      { src: icone(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icone(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icone(512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** Tamanhos de ícone que a rota aceita (o resto vira 192). */
export const TAMANHOS_DE_ICONE = [180, 192, 512] as const;

export function tamanhoDeIcone(valor: string | null): (typeof TAMANHOS_DE_ICONE)[number] {
  const n = Number(valor);
  return (TAMANHOS_DE_ICONE as readonly number[]).includes(n) ? (n as (typeof TAMANHOS_DE_ICONE)[number]) : 192;
}
