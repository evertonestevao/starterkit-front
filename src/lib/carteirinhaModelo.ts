import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CIVIL_LABEL } from "@/lib/fichaMembro";
import type { EstadoCivil } from "@/types/acompanhamento";
import type { CampoCarteirinha, Carteirinha, CarteirinhaModelo, LayoutCarteirinha } from "@/types/carteirinha";

/**
 * Modelo da carteirinha: os desenhos prontos, as cores e as informações que a
 * igreja do topo da rede escolhe. Regras puras (sem I/O), usadas pela tela de
 * configuração, pela carteirinha na tela e pelo PDF — os três leem daqui para
 * mostrar a mesma coisa.
 */

export const LAYOUTS: Array<{ chave: LayoutCarteirinha; nome: string; descricao: string }> = [
  { chave: "classico", nome: "Clássico", descricao: "Faixa colorida no topo, com o nome da igreja." },
  { chave: "lateral", nome: "Faixa lateral", descricao: "Coluna colorida à esquerda, com a foto." },
  { chave: "minimalista", nome: "Minimalista", descricao: "Fundo branco, com a cor só nos detalhes." },
];

export const CAMPOS_CARTEIRINHA: Array<{ chave: CampoCarteirinha; rotulo: string }> = [
  { chave: "cargos", rotulo: "Cargos" },
  { chave: "membro_desde", rotulo: "Membro desde" },
  { chave: "batismo", rotulo: "Batismo" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "estado_civil", rotulo: "Estado civil" },
];

/** Combinações prontas, para quem não quer escolher cor a cor. */
export const PALETAS: Array<{ nome: string; corPrimaria: string; corDestaque: string }> = [
  { nome: "Verde", corPrimaria: "#2a5440", corDestaque: "#5b6b63" },
  { nome: "Azul", corPrimaria: "#1f3a5f", corDestaque: "#4a6fa5" },
  { nome: "Vinho", corPrimaria: "#6b1f2a", corDestaque: "#8a5a5f" },
  { nome: "Roxo", corPrimaria: "#44306b", corDestaque: "#7a68a6" },
  { nome: "Dourado", corPrimaria: "#8a6a1c", corDestaque: "#5c5340" },
  { nome: "Grafite", corPrimaria: "#2b2f36", corDestaque: "#6b7280" },
];

export const TITULO_MAX = 40;
export const RODAPE_MAX = 80;
export const TEXTO_VERSO_MAX = 160;

/** O que vale enquanto a rede não gravar o dela — igual à carteirinha de antes de existir modelo. */
export const MODELO_PADRAO: CarteirinhaModelo = {
  layout: "classico",
  corPrimaria: "#2a5440",
  corDestaque: "#5b6b63",
  titulo: "Carteira de membro",
  mostrarLogo: true,
  campos: ["cargos", "membro_desde"],
  rodape: null,
  textoVerso: null,
};

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isLayout(valor: unknown): valor is LayoutCarteirinha {
  return LAYOUTS.some((l) => l.chave === valor);
}

export function isCampo(valor: unknown): valor is CampoCarteirinha {
  return CAMPOS_CARTEIRINHA.some((c) => c.chave === valor);
}

/** O modelo a usar: o gravado, ou o padrão. Título vazio cai no padrão. */
export function resolverModelo(modelo: CarteirinhaModelo | null | undefined): CarteirinhaModelo {
  if (!modelo) return MODELO_PADRAO;
  return { ...modelo, titulo: modelo.titulo.trim() || MODELO_PADRAO.titulo };
}

/** "#1a2b3c" → [26, 43, 60]. Cor inválida vira preto. */
export function hexParaRgb(hex: string): [number, number, number] {
  if (!HEX_RE.test(hex)) return [0, 0, 0];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Cor do texto que se lê SOBRE a cor dada: branco no escuro, quase preto no
 * claro (luminância relativa do WCAG). É o que impede a igreja de escolher
 * amarelo e ficar com o nome dela ilegível na faixa.
 */
export function corSobre(hex: string): "#ffffff" | "#111827" {
  const [r, g, b] = hexParaRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.4 ? "#111827" : "#ffffff";
}

/** A cor é clara demais para escrever com ela sobre o branco (rótulos, nome da igreja no minimalista). */
export function claraDemais(hex: string): boolean {
  return corSobre(hex) === "#111827";
}

export interface InformacaoCarteirinha {
  rotulo: string;
  valor: string;
}

/**
 * As informações em pares rótulo/valor (fora os cargos, que têm lugar próprio
 * sob o nome), na ordem do catálogo. Só entram as que o modelo mostra E que o
 * membro tem preenchidas.
 */
export function informacoesDaCarteirinha(
  c: Pick<Carteirinha, "membroDesde" | "batismo" | "nascimento" | "estadoCivil">,
  modelo: CarteirinhaModelo,
): InformacaoCarteirinha[] {
  const valores: Record<Exclude<CampoCarteirinha, "cargos">, string | null> = {
    membro_desde: c.membroDesde ? formatarData(c.membroDesde) : null,
    batismo: c.batismo ? formatarData(c.batismo) : null,
    nascimento: c.nascimento ? formatarData(c.nascimento) : null,
    estado_civil: c.estadoCivil ? (ESTADO_CIVIL_LABEL[c.estadoCivil as EstadoCivil] ?? null) : null,
  };
  return CAMPOS_CARTEIRINHA.filter((campo) => campo.chave !== "cargos" && modelo.campos.includes(campo.chave)).flatMap(
    (campo) => {
      const valor = valores[campo.chave as Exclude<CampoCarteirinha, "cargos">];
      return valor ? [{ rotulo: campo.rotulo, valor }] : [];
    },
  );
}

/** Os cargos só aparecem se o modelo os mostra. */
export function cargosDaCarteirinha(c: Pick<Carteirinha, "cargos">, modelo: CarteirinhaModelo): string | null {
  return modelo.campos.includes("cargos") ? c.cargos : null;
}

/** A logo só aparece se o modelo a mostra (e a igreja tem uma). */
export function logoDaCarteirinha(c: Pick<Carteirinha, "logoUrl">, modelo: CarteirinhaModelo): string | null {
  return modelo.mostrarLogo ? c.logoUrl : null;
}

/** Membro de mentira, para a igreja ver o modelo com todas as informações preenchidas. */
export function carteirinhaDeExemplo(
  igreja: { nome: string; sobrenome: string | null; pastor: string | null; logoUrl: string | null },
  modelo: CarteirinhaModelo,
  validade: string,
): Carteirinha {
  return {
    nome: "Maria Aparecida de Souza",
    cargos: "Diaconisa",
    igreja: igreja.nome,
    igrejaSobrenome: igreja.sobrenome,
    pastor: igreja.pastor ?? "Nome do Pastor",
    membroDesde: "2005-01-09",
    batismo: "2004-11-21",
    nascimento: "1985-03-12",
    estadoCivil: "casado",
    modelo,
    logoUrl: igreja.logoUrl,
    validade,
    codigo: "A1B2C3D4E5F60789",
    estado: "valida",
    temFoto: false,
  };
}
