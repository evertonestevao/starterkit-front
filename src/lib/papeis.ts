import type { RoleCode } from "@/types/database";

/**
 * Papel no sistema em português, para quem usa (um pastor não conhece
 * "owner"). O código continua usando owner/admin/member.
 */
export const PAPEL_LABEL: Record<RoleCode, string> = {
  owner: "Responsável",
  admin: "Administrador",
  member: "Membro",
};
