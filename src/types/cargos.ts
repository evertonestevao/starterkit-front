/**
 * Catálogo de cargos (migration 20261001130000). Um catálogo só:
 * - padrão da plataforma (churchId null), visto por todas as igrejas;
 * - criado por uma igreja, herdado pelas de baixo (sede -> subsede -> congregação).
 * Cargo identifica a pessoa; não dá permissão no sistema.
 */

/** De onde o cargo vem, do ponto de vista da igreja ativa. */
export type OrigemCargo = "plataforma" | "herdado" | "proprio";

export interface Cargo {
  id: string;
  /** null = padrão da plataforma. */
  churchId: string | null;
  /** Igreja que criou (para "herdado da Sede X"); null na plataforma. */
  donoNome: string | null;
  /** Só nos da plataforma (ex.: "pastor"). */
  slug: string | null;
  nome: string;
  descricao: string | null;
  /** Uma pessoa por igreja (ex.: Pastor). */
  unico: boolean;
  ordem: number;
  desativado: boolean;
  origem: OrigemCargo;
}

/** Cargo como aparece em quem o ocupa (membro do rol, líder). */
export interface CargoResumo {
  id: string;
  nome: string;
  ordem: number;
  desativado: boolean;
}
