import type { RoleCode } from "@/types/database";

/**
 * Regras de permissão por papel (plano §5: estrutura pronta para permissões
 * granulares depois). Puro e sem I/O — o papel vem da membership carregada
 * pelo tenantService; a barreira final é sempre RLS + checagem no service.
 */

export const permissionService = {
  /** Gerenciar membros e convites: owner e admin. */
  canManageMembers(role: RoleCode): boolean {
    return role === "owner" || role === "admin";
  },

  /** Editar dados da empresa (nome, slug): owner e admin. */
  canEditCompany(role: RoleCode): boolean {
    return role === "owner" || role === "admin";
  },

  /** Ver auditoria: owner e admin (espelha a policy de audit_logs). */
  canViewAudit(role: RoleCode): boolean {
    return role === "owner" || role === "admin";
  },

  /** Decisões de billing (assinar, cancelar): só owner. */
  canManageBilling(role: RoleCode): boolean {
    return role === "owner";
  },

  /** Alterar papel de um membro: só owner pode promover/rebaixar admin. */
  canChangeRole(actorRole: RoleCode, targetCurrentRole: RoleCode): boolean {
    if (actorRole === "owner") return targetCurrentRole !== "owner";
    if (actorRole === "admin") return targetCurrentRole === "member";
    return false;
  },

  /** Remover um membro da empresa. Owner nunca é removível por aqui. */
  canRemoveMember(actorRole: RoleCode, targetRole: RoleCode): boolean {
    if (targetRole === "owner") return false;
    if (actorRole === "owner") return true;
    return actorRole === "admin" && targetRole === "member";
  },
};

export type PermissionService = typeof permissionService;
