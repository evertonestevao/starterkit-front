import type { Company, CompanyMember, RoleCode } from "./database";

/** Empresa + papel do usuário logado nela (resultado do join com membership). */
export interface CompanyWithRole extends Company {
  role: RoleCode;
}

/** Membro com dados de perfil para listagem de equipe. */
export interface MemberWithProfile extends CompanyMember {
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}
