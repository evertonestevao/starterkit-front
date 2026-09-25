/**
 * Cargos da igreja (pastor, presbítero, secretário...). Só identificam quem é
 * quem: cargo NÃO dá acesso ao sistema — isso continua sendo o papel na
 * empresa (owner/admin/member).
 */

export type ChurchCargo = "pastor" | "pastor_auxiliar" | "presbitero" | "diacono" | "secretario";

/** Papéis que um convite pode dar (owner não é convidável). */
export type LeaderInviteRole = "admin" | "member";

export interface ChurchLeader {
  id: string;
  churchId: string;
  cargo: ChurchCargo;
  nome: string;
  email: string | null;
  telefone: string | null;
  /** O convite para acessar o sistema já foi enviado. */
  convidadoEm: string | null;
  /** A pessoa aceitou o convite e tem conta. */
  temAcesso: boolean;
  desde: string;
}

/** Igreja da empresa ativa, com quem ocupa os cargos dela. */
export interface ChurchWithLeaders {
  id: string;
  name: string;
  leaders: ChurchLeader[];
}
