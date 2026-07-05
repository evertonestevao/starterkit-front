import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type { CompanyWithRole, MemberWithProfile } from "@/types/tenant";
import { permissionService } from "./permissionService";

/**
 * Regras de multi-tenant: empresas do usuário, criação, membros e papéis.
 * Toda operação sensível revalida papel aqui (não confiar só em RLS).
 */

export interface TenantRepository {
  /** Empresas ativas em que o usuário logado é membro, com o papel dele. */
  listMyCompanies(): Promise<CompanyWithRole[]>;
  /** RPC create_company: empresa + membership owner, atômico. */
  createCompany(name: string, slug: string): Promise<CompanyWithRole>;
  updateCompany(companyId: string, data: { name: string }): Promise<void>;
  /** Papel do usuário logado na empresa, ou null se não é membro ativo. */
  getMyRole(companyId: string): Promise<RoleCode | null>;
  listMembers(companyId: string): Promise<MemberWithProfile[]>;
  getMember(memberId: string, companyId: string): Promise<MemberWithProfile | null>;
  updateMemberRole(memberId: string, companyId: string, role: RoleCode): Promise<void>;
  /** Soft delete da membership. */
  removeMember(memberId: string, companyId: string): Promise<void>;
  /** RPC leave_company (sair da empresa sem precisar de UPDATE direto). */
  leaveCompany(companyId: string): Promise<void>;
}

const companyNameSchema = z.string().trim().min(2, "Nome muito curto").max(80);

/** Gera slug a partir do nome: minúsculas, sem acentos, hífens. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "empresa";
}

export function createTenantService(repo: TenantRepository) {
  async function listMyCompanies(): Promise<CompanyWithRole[]> {
    return repo.listMyCompanies();
  }

  async function createCompany(input: { name: unknown }): Promise<CompanyWithRole> {
    const parsed = companyNameSchema.safeParse(input.name);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Nome inválido",
      );
    }
    const name = parsed.data;
    try {
      return await repo.createCompany(name, slugify(name));
    } catch (err) {
      if (err instanceof AppError && err.code === "conflict") {
        // Slug em uso: tenta uma vez com sufixo aleatório curto.
        const suffix = Math.random().toString(36).slice(2, 6);
        return repo.createCompany(name, `${slugify(name)}-${suffix}`);
      }
      throw err;
    }
  }

  async function updateCompany(companyId: string, input: { name: unknown }): Promise<void> {
    const parsed = companyNameSchema.safeParse(input.name);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Nome inválido",
      );
    }
    const role = await requireMembership(companyId);
    if (!permissionService.canEditCompany(role)) {
      throw new AppError("forbidden", "Sem permissão para editar a empresa");
    }
    await repo.updateCompany(companyId, { name: parsed.data });
  }

  /** Papel do usuário na empresa; lança forbidden se não for membro ativo. */
  async function requireMembership(companyId: string): Promise<RoleCode> {
    const role = await repo.getMyRole(companyId);
    if (!role) {
      throw new AppError("forbidden", "Você não é membro desta empresa");
    }
    return role;
  }

  async function listMembers(companyId: string): Promise<MemberWithProfile[]> {
    await requireMembership(companyId);
    return repo.listMembers(companyId);
  }

  async function changeMemberRole(
    companyId: string,
    memberId: string,
    newRole: RoleCode,
  ): Promise<void> {
    if (newRole === "owner") {
      throw new AppError("validation_error", "Transferência de ownership não é suportada aqui");
    }
    const actorRole = await requireMembership(companyId);
    // getMember filtra por companyId: ID de outro tenant resulta em not_found.
    const target = await repo.getMember(memberId, companyId);
    if (!target) {
      throw new AppError("not_found", "Membro não encontrado");
    }
    if (!permissionService.canChangeRole(actorRole, target.role)) {
      throw new AppError("forbidden", "Sem permissão para alterar este papel");
    }
    await repo.updateMemberRole(memberId, companyId, newRole);
  }

  async function removeMember(companyId: string, memberId: string): Promise<void> {
    const actorRole = await requireMembership(companyId);
    const target = await repo.getMember(memberId, companyId);
    if (!target) {
      throw new AppError("not_found", "Membro não encontrado");
    }
    if (!permissionService.canRemoveMember(actorRole, target.role)) {
      throw new AppError("forbidden", "Sem permissão para remover este membro");
    }
    await repo.removeMember(memberId, companyId);
  }

  async function leaveCompany(companyId: string): Promise<void> {
    const role = await requireMembership(companyId);
    if (role === "owner") {
      throw new AppError("forbidden", "O owner não pode sair da própria empresa");
    }
    await repo.leaveCompany(companyId);
  }

  return {
    listMyCompanies,
    createCompany,
    updateCompany,
    requireMembership,
    listMembers,
    changeMemberRole,
    removeMember,
    leaveCompany,
  };
}

export type TenantService = ReturnType<typeof createTenantService>;
