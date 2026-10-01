/**
 * EBD — Escola Bíblica Dominical (migration 20261001160000).
 * O aluno é sempre uma pessoa de rol_membros (membro ou não do quadro).
 */

import type { EstadoPresenca } from "./acompanhamento";

export interface EbdProfessor {
  membroId: string;
  nome: string;
  /** Tem conta ligada: consegue entrar e fazer a chamada da classe. */
  temLogin: boolean;
}

export interface EbdClasse {
  id: string;
  nome: string;
  faixaEtaria: string | null;
  sala: string | null;
  ordem: number;
  ativa: boolean;
  /** Idade (anos completos) para sugerir a classe na promoção. */
  idadeMinima: number | null;
  idadeMaxima: number | null;
  matriculados: number;
  professores: EbdProfessor[];
}

export interface EbdAluno {
  membroId: string;
  matriculaId: string;
  nome: string;
  whatsapp: string | null;
  nascimento: string | null;
  /** false = não faz parte do quadro de membros (ex.: criança, congregado). */
  membroIgreja: boolean;
  desde: string;
  /** Alergias, medicação (dado sensível). */
  cuidados: string | null;
}

export interface EbdVisitante {
  id?: string;
  nome: string;
  telefone: string | null;
  /** Já foi matriculado (virou aluno). */
  membroId: string | null;
}

/** A chamada de uma classe num domingo, pronta para preencher ou reabrir. */
export interface EbdAulaParaPreencher {
  classe: Pick<EbdClasse, "id" | "nome">;
  data: string;
  aulaId: string | null;
  alunos: EbdAluno[];
  presencas: Record<string, EstadoPresenca>;
  visitantes: EbdVisitante[];
  licao: string | null;
  biblias: number;
  revistas: number;
  ofertaCentavos: number;
}

export interface EbdAulaResumo {
  aulaId: string;
  data: string;
  licao: string | null;
  presentes: number;
  ausentes: number;
  justificados: number;
  visitantes: number;
  biblias: number;
  revistas: number;
  ofertaCentavos: number;
}

/** Uma linha do resumo do domingo (uma por classe). */
export interface EbdResumoClasse {
  classeId: string;
  classeNome: string;
  matriculados: number;
  chamadaFeita: boolean;
  presentes: number;
  ausentes: number;
  justificados: number;
  visitantes: number;
  biblias: number;
  revistas: number;
  ofertaCentavos: number;
  licao: string | null;
}

export interface EbdPessoaBusca {
  membroId: string;
  nome: string;
  membroIgreja: boolean;
  classeAtual: string | null;
}

/** A EBD de uma pessoa, na ficha do membro. */
export interface EbdResumoMembro {
  classeAtual: string | null;
  desde: string | null;
  presencas: number;
  ausencias: number;
  justificados: number;
  ultimaPresenca: string | null;
  classesAnteriores: string | null;
}

/** Aluno com faltas seguidas na classe (alerta da EBD, separado do culto). */
export interface EbdAlerta {
  membroId: string;
  nome: string;
  whatsapp: string | null;
  nascimento: string | null;
  membroIgreja: boolean;
  classeId: string;
  classeNome: string;
  faltasSeguidas: number;
  ultimaPresenca: string | null;
  ultimaFalta: string | null;
  contatoData: string | null;
  contatoResultado: "retornou" | "em_acompanhamento" | "mudou_de_cidade" | "outro" | null;
  situacao: "pendente" | "em_acompanhamento";
  /** Primeiro responsável com telefone (para criança sem WhatsApp). */
  responsavelNome: string | null;
  responsavelTelefone: string | null;
}

/** Período da revista (ex.: "4º trimestre de 2026"). */
export interface EbdTrimestre {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  revista: string | null;
}

export interface EbdRelatorioClasse {
  classeId: string;
  classeNome: string;
  aulas: number;
  presentes: number;
  ausentes: number;
  justificados: number;
  visitantes: number;
  biblias: number;
  revistas: number;
  ofertaCentavos: number;
  matriculadosHoje: number;
}

export interface EbdFrequenciaAluno {
  membroId: string;
  nome: string;
  membroIgreja: boolean;
  classeId: string;
  classeNome: string;
  matriculadoHoje: boolean;
  presentes: number;
  ausentes: number;
  justificados: number;
  /** % sobre presentes + ausentes (justificados fora); null = sem aula. */
  percentual: number | null;
}

/** Responsável por um aluno (geralmente criança). */
export interface EbdResponsavel {
  id: string;
  membroId: string;
  /** Responsável que está em Membros (nome e telefone vêm de lá). */
  responsavelId: string | null;
  nome: string;
  telefone: string | null;
  parentesco: string;
  podeBuscar: boolean;
}

/** Lição de um trimestre (uma por domingo). */
export interface EbdLicao {
  id: string;
  trimestreId: string;
  numero: number;
  data: string;
  /** Título da classe pedida (revista dela) ou, sem classe, o geral. */
  titulo: string | null;
  /** O título geral, para mostrar quando a classe não tem o seu. */
  tituloGeral: string | null;
}

/** A EBD de uma igreja abaixo, só em números (para a igreja de cima). */
export interface EbdRedeIgreja {
  churchId: string;
  churchName: string;
  tipo: string;
  classes: number;
  matriculados: number;
  ultimoDomingo: string | null;
  presentesUltimo: number;
  visitantesUltimo: number;
  /** % de presença nas últimas 8 semanas (P / (P + A)). */
  presenca8Semanas: number | null;
}

/** Linha da tela de promoção: aluno, classe atual e a sugerida pela idade. */
export interface EbdPromocaoLinha {
  membroId: string;
  nome: string;
  nascimento: string | null;
  membroIgreja: boolean;
  classeAtualId: string;
  classeAtualNome: string;
}
