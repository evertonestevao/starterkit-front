/**
 * Chamada e Acompanhamento: rol de membros, cultos, chamadas, justificativas
 * e o aviso de quem está faltando. Espelha a migration 20261001100000.
 *
 * "Membro" aqui é a pessoa do ROL da igreja (rol_membros), não quem usa o
 * sistema (company_members).
 */

import type { CargoResumo } from "./cargos";

export type EstadoPresenca = "presente" | "ausente" | "justificado";

export type MotivoJustificativa = "viagem" | "saude" | "trabalho" | "outro";

export type ResultadoContato = "retornou" | "em_acompanhamento" | "mudou_de_cidade" | "outro";

/** De qual lista o contato veio: cada lista some com o seu. */
export type MotivoContato = "faltas" | "justificativa_longa";

export type SituacaoAlerta = "pendente" | "em_acompanhamento";

export interface RolMembro {
  id: string;
  churchId: string;
  nome: string;
  /** Cargos do catálogo (vários por pessoa), já ordenados. */
  cargos: CargoResumo[];
  whatsapp: string | null;
  /** Usado para convidar a pessoa ao sistema. */
  email: string | null;
  /** Conta de login ligada (o acesso em si vem de company_members). */
  userId: string | null;
  /** Aparece na chamada e nos alertas (login que só administra fica fora). */
  participaChamada: boolean;
  /** Faz parte do quadro de membros (false: congregado, criança da EBD...). */
  membroIgreja: boolean;
  /** Alergias, medicação (dado sensível). */
  cuidados: string | null;
  nascimento: string | null;
  batismo: string | null;
  ativo: boolean;
  /** Espelho da situação da ficha (ativo, afastado, transferido...). */
  situacao: SituacaoMembro;
  observacoes: string | null;
}

export type SexoMembro = "masculino" | "feminino";
export type EstadoCivil = "solteiro" | "casado" | "uniao_estavel" | "divorciado" | "viuvo";
export type FormaEntrada = "batismo" | "aclamacao" | "transferencia" | "outro";
export type SituacaoMembro = "ativo" | "afastado" | "transferido" | "desligado" | "falecido";

/**
 * Ficha completa do membro (tabela rol_membro_fichas). Só quem tem o módulo
 * Membros lê e grava: endereço e família não aparecem para quem só faz a chamada.
 */
export interface FichaMembro {
  /** O número do rol, como a secretaria cita o membro. Único na igreja. */
  numeroFicha: string | null;
  /** Só os 11 dígitos. Identificação — não é login. Único na igreja. */
  cpf: string | null;
  rg: string | null;
  /** Segundo telefone (fixo, recado). O principal é o WhatsApp do cadastro. */
  telefone2: string | null;
  sexo: SexoMembro | null;
  estadoCivil: EstadoCivil | null;
  naturalidade: string | null;
  profissao: string | null;
  conjugeNome: string | null;
  dataCasamento: string | null;
  paiNome: string | null;
  maeNome: string | null;
  /** Nomes dos filhos, em texto livre. */
  filhos: string | null;
  /** Só os 8 dígitos. */
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  dataConversao: string | null;
  /** Como entrou para o quadro de membros. */
  entradaForma: FormaEntrada | null;
  membroDesde: string | null;
  igrejaOrigem: string | null;
  /** Onde foi batizado nas águas (a data fica no cadastro do membro). */
  batismoAguasLocal: string | null;
  batismoEspiritoData: string | null;
  batismoEspiritoLocal: string | null;
  /** A qual ministério foi consagrado (diaconato, presbitério...). */
  consagracaoMinisterio: string | null;
  consagracaoOndePorQuem: string | null;
  /** Diferente de "ativo" tira a pessoa da chamada e dos alertas. */
  situacao: SituacaoMembro;
  situacaoEm: string | null;
  situacaoMotivo: string | null;
}

export type TipoAniversario = "nascimento" | "batismo" | "casamento";

/** Uma data comemorada no mês: aniversário, batismo ou casamento. */
export interface Aniversario {
  membroId: string;
  nome: string;
  whatsapp: string | null;
  tipo: TipoAniversario;
  /** A data original (AAAA-MM-DD), com o ano em que aconteceu. */
  data: string;
  dia: number;
  /** Só no casamento, quando a ficha informa. */
  conjugeNome: string | null;
}

/** Acesso ao sistema de quem tem login (vem de company_members). */
export interface AcessoMembro {
  /** id da linha em company_members (para trocar papel / remover acesso). */
  companyMemberId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}

/** Convite pendente para o sistema (só owner/admin enxergam). */
export interface ConvitePendente {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  expiraEm: string;
}

/**
 * Culto = item da Programação (church_schedule). Semanal repete no
 * `diaSemana`; especial acontece só na `data`.
 */
export interface Culto {
  id: string;
  churchId: string;
  nome: string;
  tipo: "semanal" | "especial";
  /** 0 = domingo ... 6 = sábado. Só no semanal. */
  diaSemana: number | null;
  /** Só no especial. */
  data: string | null;
  /** "HH:MM". */
  hora: string;
  registraChamada: boolean;
  /** Saiu da programação: só aparece no histórico. */
  removido: boolean;
}

/** Culto e data sugeridos para a chamada agora. */
export interface SugestaoChamada {
  culto: Culto;
  data: string;
  /** O culto é hoje (senão é a última vez que aconteceu). */
  hoje: boolean;
}

export interface Justificativa {
  id: string;
  membroId: string;
  membroNome: string;
  motivo: MotivoJustificativa;
  motivoTexto: string | null;
  dataInicio: string;
  dataFim: string;
  encerradaEm: string | null;
}

export interface Presenca {
  membroId: string;
  estado: EstadoPresenca;
  justificativaId: string | null;
}

export interface Visitante {
  nome: string;
  telefone: string | null;
}

/** Tudo que a tela de chamada precisa para um culto numa data. */
export interface ChamadaParaPreencher {
  culto: Culto;
  data: string;
  /** null = chamada ainda não feita (é nova). */
  chamadaId: string | null;
  membros: RolMembro[];
  presencas: Presenca[];
  visitantes: Visitante[];
  /** Justificativas que cobrem a data: o membro aparece pré-marcado. */
  justificativas: Justificativa[];
}

export interface AlertaFaltas {
  membroId: string;
  nome: string;
  whatsapp: string | null;
  faltasSeguidas: number;
  ultimaPresenca: string | null;
  ultimaFalta: string | null;
  contatoData: string | null;
  contatoResultado: ResultadoContato | null;
  situacao: SituacaoAlerta;
}

export interface JustificativaLonga {
  membroId: string;
  nome: string;
  whatsapp: string | null;
  cultosJustificados: number;
  desde: string;
  dias: number;
  ultimaPresenca: string | null;
  contatoData: string | null;
  contatoResultado: ResultadoContato | null;
  situacao: SituacaoAlerta;
}

export interface RelatorioChamada {
  chamadaId: string;
  cultoId: string;
  cultoNome: string;
  data: string;
  presentes: number;
  justificados: number;
  ausentes: number;
  visitantes: number;
}

export interface FrequenciaMembro {
  membroId: string;
  nome: string;
  ativo: boolean;
  presentes: number;
  justificados: number;
  ausentes: number;
  /** % de presença só sobre cultos SEM justificativa; null = nenhum culto. */
  percentual: number | null;
}

export interface ResumoAcompanhamento {
  ultimaChamadaData: string | null;
  ultimoCultoNome: string | null;
  presentes: number;
  justificados: number;
  ausentes: number;
  visitantes: number;
  membrosAtivos: number;
  emAlerta: number;
  justificativasLongas: number;
  contatosPendentes: number;
}

/** Só números: é o que a igreja de cima vê das de baixo (LGPD). */
export interface ResumoRedeIgreja {
  churchId: string;
  churchName: string;
  tipo: string;
  ultimaChamadaData: string | null;
  presentes: number;
  justificados: number;
  ausentes: number;
  membrosAtivos: number;
  emAlerta: number;
}

/** Indicadores do topo da tela de Membros. */
export interface MembrosKpis {
  /** Ativos do quadro de membros. */
  ativos: number;
  inativos: number;
  /** Ativos que não fazem parte do quadro (crianças da EBD, congregados). */
  naoMembros: number;
  novosNoMes: number;
  aniversariantesDoMes: number;
  comCargo: number;
  /** % de presença nas últimas 8 semanas (sem justificados); null = sem chamadas. */
  presencaMedia: number | null;
  emAlerta: number;
}

export interface ConfigAcompanhamento {
  faltasAlerta: number;
  justificativaLongaCultos: number;
  justificativaLongaDias: number;
}

export interface HistoricoMembroItem {
  data: string;
  cultoNome: string;
  estado: EstadoPresenca;
}

export interface ContatoRegistrado {
  id: string;
  data: string;
  motivo: MotivoContato;
  resultado: ResultadoContato;
  observacao: string | null;
}
