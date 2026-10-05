import type { Company, CompanyMember, RoleCode } from "./database";

/** Empresa + papel do usuário logado nela (resultado do join com membership). */
export interface CompanyWithRole extends Company {
  role: RoleCode;
  /** Pode fazer chamada e acompanhamento (owner/admin já podem): cargo com Presença ou Membros liberado. */
  pode_acompanhar: boolean;
  /** Gestão da EBD (owner/admin já podem): cargo com EBD liberado. */
  pode_gerir_ebd: boolean;
  /** Módulos liberados para a pessoa: a soma do que os cargos dela liberam. */
  acessos: string[];
  /** É professor(a) de alguma classe da EBD desta empresa. */
  professor_ebd: boolean;
}

/** Convite pendente endereçado ao usuário logado (RPC my_pending_invites). */
export interface MyPendingInvite {
  id: string;
  company_name: string;
  role: RoleCode;
  token: string;
  expires_at: string;
}

/** Membro com dados de perfil para listagem de equipe. */
export interface MemberWithProfile extends CompanyMember {
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}
