import type { Company, CompanyMember, RoleCode } from "./database";

/** Empresa + papel do usuário logado nela (resultado do join com membership). */
export interface CompanyWithRole extends Company {
  role: RoleCode;
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
