/** Consentimento do membro (LGPD), foto e carteirinha. */

export interface Consentimento {
  cadastro: boolean;
  foto: boolean;
  carteirinha: boolean;
  /** AAAA-MM-DD: data da assinatura no papel. */
  assinadoEm: string | null;
  /** Menor de idade: quem assinou por ele. */
  responsavelNome: string | null;
  temFoto: boolean;
}

export interface ConsentimentoInput {
  cadastro: boolean;
  foto: boolean;
  carteirinha: boolean;
  assinadoEm: string | null;
  responsavelNome: string | null;
}

/** "valida" é a única em que a carteirinha vale. */
export type EstadoCarteirinha = "valida" | "vencida" | "inativa" | "cancelada";

export type LayoutCarteirinha = "classico" | "lateral" | "minimalista";

/** Informações do membro que a igreja pode mostrar na carteirinha. */
export type CampoCarteirinha = "cargos" | "membro_desde" | "batismo" | "nascimento" | "estado_civil";

/** Aparência e informações da carteirinha, definidas pela igreja do topo da rede. */
export interface CarteirinhaModelo {
  layout: LayoutCarteirinha;
  /** "#rrggbb". */
  corPrimaria: string;
  corDestaque: string;
  titulo: string;
  /** Mostrar a logo da igreja (se ela tiver uma). */
  mostrarLogo: boolean;
  campos: CampoCarteirinha[];
  rodape: string | null;
  textoVerso: string | null;
}

/** O modelo que vale para a igreja, de onde vem e se quem pergunta pode mudar. */
export interface ModeloDaRede {
  modelo: CarteirinhaModelo;
  /** false = ainda vale o padrão da plataforma. */
  personalizado: boolean;
  /** Igreja do topo da rede, que define o modelo. */
  origemNome: string;
  podeEditar: boolean;
  /** Logo da igreja ativa (ou da igreja do topo); null se nenhuma tem. */
  logoUrl: string | null;
}

export interface Carteirinha {
  nome: string;
  /** Cargos separados por vírgula, ou null. */
  cargos: string | null;
  igreja: string;
  igrejaSobrenome: string | null;
  pastor: string | null;
  membroDesde: string | null;
  /** Só vêm quando o modelo da rede os mostra. */
  batismo: string | null;
  nascimento: string | null;
  estadoCivil: string | null;
  /** Modelo gravado pela rede; null = padrão da plataforma. */
  modelo: CarteirinhaModelo | null;
  /** Logo da igreja do membro (ou da igreja do topo); null se não há, ou se o modelo não a mostra. */
  logoUrl: string | null;
  /** AAAA-MM-DD. */
  validade: string;
  /** Código do QR Code. */
  codigo: string;
  estado: EstadoCarteirinha;
  temFoto: boolean;
}

/** Na ficha: a carteirinha e se há um link pessoal em vigor. */
export interface CarteirinhaDoMembro extends Carteirinha {
  temLink: boolean;
}

/** O que a página do QR Code mostra: o mínimo. */
export interface VerificacaoCarteirinha {
  estado: EstadoCarteirinha;
  /** Só quando válida ou vencida. */
  nome: string | null;
  igreja: string;
  igrejaSobrenome: string | null;
  validade: string | null;
}

export interface FotoMembro {
  bytes: Uint8Array;
  tipo: "image/jpeg" | "image/png";
}
