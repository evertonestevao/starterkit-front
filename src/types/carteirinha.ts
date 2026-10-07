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

export interface Carteirinha {
  nome: string;
  /** Cargos separados por vírgula, ou null. */
  cargos: string | null;
  igreja: string;
  igrejaSobrenome: string | null;
  pastor: string | null;
  membroDesde: string | null;
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
