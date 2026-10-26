import type { RoleCode, SubscriptionStatus } from "./database";

/** Membership vista pela exclusão de conta: o que impede ou acompanha a exclusão. */
export interface AccountMembership {
  companyId: string;
  companyName: string;
  role: RoleCode;
  /** Membros ativos da empresa, incluindo o próprio usuário. */
  activeMembers: number;
  /** Status da assinatura (só preenchido quando o usuário é owner). */
  subscriptionStatus: SubscriptionStatus | null;
}

/** Arquivo de portabilidade (LGPD, art. 18, V): dados pessoais do titular. */
export interface MyDataExport {
  exportedAt: string;
  account: { id: string; email: string; createdAt: string };
  profile: { fullName: string | null; avatarUrl: string | null } | null;
  memberships: Array<{ companyName: string; role: RoleCode; since: string }>;
  termsAcceptances: Array<{
    version: number;
    acceptedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  }>;
  consents: Array<{
    type: string;
    granted: boolean;
    createdAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  }>;
}
