/** Secretaria: histórico do membro e documentos (declaração e cartas). */

export type TipoDocumento = "declaracao" | "recomendacao" | "transferencia";

export type TipoHistorico = "cadastro" | "situacao" | "documento" | "anotacao";

export interface HistoricoItem {
  id: string;
  tipo: TipoHistorico;
  titulo: string;
  detalhe: string | null;
  /** AAAA-MM-DD: quando aconteceu. */
  data: string;
}

/** De onde vem o texto que vale para a igreja. */
export type OrigemModelo = "padrao" | "propria" | "herdado";

export interface ModeloDocumento {
  tipo: TipoDocumento;
  titulo: string;
  corpo: string;
  origem: OrigemModelo;
  /** Igreja de cima que escreveu o modelo, quando herdado. */
  origemNome: string | null;
}

/** Modelo gravado por uma igreja (a própria ou uma acima). */
export interface ModeloGravado {
  tipo: TipoDocumento;
  titulo: string;
  corpo: string;
  origemChurchId: string;
  origemNome: string;
}

export interface IgrejaDoDocumento {
  nome: string;
  sobrenome: string | null;
  endereco: string | null;
  saudacao: string | null;
  /** Quem tem o cargo Pastor na igreja: é quem assina. */
  pastor: string | null;
}

/** O que os campos do modelo usam do membro. */
export interface MembroDoDocumento {
  nome: string;
  sexo: "masculino" | "feminino" | null;
  nascimento: string | null;
  estadoCivil: string | null;
  batismo: string | null;
  membroDesde: string | null;
  cargos: string[];
}

/** Documento pronto para virar PDF. */
export interface DocumentoPronto {
  tipo: TipoDocumento;
  titulo: string;
  paragrafos: string[];
  igreja: string;
  enderecoIgreja: string | null;
  /** "6 de outubro de 2026". */
  dataExtenso: string;
  pastor: string | null;
}
