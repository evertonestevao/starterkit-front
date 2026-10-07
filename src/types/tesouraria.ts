/** Tesouraria: dízimos e ofertas dos cultos. */

export type TipoLancamento = "dizimo" | "oferta";
export type FormaLancamento = "dinheiro" | "pix" | "cartao" | "outro";

export interface Lancamento {
  id: string;
  /** AAAA-MM-DD. */
  data: string;
  scheduleId: string | null;
  /** Título do culto, copiado no lançamento. */
  cultoTitulo: string | null;
  tipo: TipoLancamento;
  valorCentavos: number;
  forma: FormaLancamento;
  membroId: string | null;
  /** De quem é (dízimo). Vazio = sem nome. */
  nome: string | null;
  observacao: string | null;
}

/** O que o formulário envia. */
export interface LancamentoInput {
  data: string;
  scheduleId: string | null;
  tipo: TipoLancamento;
  valorCentavos: number;
  forma: FormaLancamento;
  membroId: string | null;
  nome: string | null;
  observacao: string | null;
}

/** Culto da programação, para escolher no lançamento. */
export interface CultoOpcao {
  id: string;
  titulo: string;
  /** "semanal" tem dia da semana (0 = domingo); "especial" tem data. */
  tipo: "semanal" | "especial";
  diaSemana: number | null;
  data: string | null;
  hora: string;
}

export interface PessoaTesouraria {
  id: string;
  nome: string;
}

export interface FiltrosLancamentos {
  /** AAAA-MM. */
  mes: string;
  tipo: TipoLancamento | "todos";
  forma: FormaLancamento | "todas";
  /** Trecho do nome do dizimista. */
  nome: string;
}
