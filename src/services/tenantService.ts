import { z } from "zod";
import { CHURCH_NETWORK_NAME_MAX_LENGTH, CHURCH_SURNAME_MAX_LENGTH } from "@/lib/churchName";
import { AppError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type { CompanyWithRole, MemberWithProfile } from "@/types/tenant";
import { permissionService } from "./permissionService";

/**
 * Regras de multi-tenant: empresas do usuário, criação, membros e papéis.
 * Toda operação sensível revalida papel aqui (não confiar só em RLS).
 */

/** Página de resultados (paginação offset em toda listagem grande). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

/** Normaliza page/pageSize vindos de query string (defensivo). */
export function normalizePageParams(
  params: PageParams | undefined,
  defaultPageSize: number,
  maxPageSize = 100,
): { page: number; pageSize: number; offset: number } {
  const rawPage = Math.trunc(params?.page ?? 1);
  const rawSize = Math.trunc(params?.pageSize ?? defaultPageSize);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(rawSize, maxPageSize) : defaultPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface TenantRepository {
  /** Empresas ativas em que o usuário logado é membro, com o papel dele. */
  listMyCompanies(): Promise<CompanyWithRole[]>;
  /** RPC create_company_with_church: empresa + membership owner + igreja, atômico. */
  createCompany(name: string, slug: string, church: NewChurchDetails): Promise<CompanyWithRole>;
  updateCompany(companyId: string, data: { name: string }): Promise<void>;
  /** Papel do usuário logado na empresa, ou null se não é membro ativo. */
  getMyRole(companyId: string): Promise<RoleCode | null>;
  listMembers(
    companyId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: MemberWithProfile[]; total: number }>;
  getMember(memberId: string, companyId: string): Promise<MemberWithProfile | null>;
  updateMemberRole(memberId: string, companyId: string, role: RoleCode): Promise<void>;
  /** Soft delete da membership. */
  removeMember(memberId: string, companyId: string): Promise<void>;
  /** RPC leave_company (sair da empresa sem precisar de UPDATE direto). */
  leaveCompany(companyId: string): Promise<void>;
}

const companyNameSchema = z.string().trim().min(2, "Nome muito curto").max(80);

/** Dados da igreja pedidos no cadastro, além do nome (que também nomeia a empresa). */
export interface NewChurchDetails {
  /** Complemento que distingue igrejas de mesmo nome ("Prainha - Promissão"). */
  sobrenome: string | null;
  /** Declaração da igreja; não liga ninguém na árvore. */
  fazParteDeRede: boolean;
  /** Só existe quando `fazParteDeRede`. */
  redeNome: string | null;
}

/** Texto opcional: aparado, espaços colapsados, vazio vira null. */
function optionalText(max: number, tooLongMessage: string) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""),
      z.string().max(max, tooLongMessage),
    )
    .transform((value) => (value === "" ? null : value));
}

const newChurchDetailsSchema = z
  .object({
    sobrenome: optionalText(CHURCH_SURNAME_MAX_LENGTH, "Complemento do nome muito longo"),
    fazParteDeRede: z.boolean().default(false),
    redeNome: optionalText(CHURCH_NETWORK_NAME_MAX_LENGTH, "Nome da rede muito longo"),
  })
  // Nome de rede sem marcar que faz parte de uma não é gravado.
  .transform((details): NewChurchDetails => ({
    ...details,
    redeNome: details.fazParteDeRede ? details.redeNome : null,
  }));

/** Gera slug a partir do nome: minúsculas, sem acentos, hífens. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "igreja";
}

export function createTenantService(repo: TenantRepository) {
  async function listMyCompanies(): Promise<CompanyWithRole[]> {
    return repo.listMyCompanies();
  }

  async function createCompany(input: {
    name: unknown;
    sobrenome?: unknown;
    fazParteDeRede?: unknown;
    redeNome?: unknown;
  }): Promise<CompanyWithRole> {
    const parsed = companyNameSchema.safeParse(input.name);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Nome inválido",
      );
    }
    const name = parsed.data;
    const details = newChurchDetailsSchema.safeParse({
      sobrenome: input.sobrenome,
      fazParteDeRede: input.fazParteDeRede === true,
      redeNome: input.redeNome,
    });
    if (!details.success) {
      throw new AppError(
        "validation_error",
        details.error.issues[0]?.message ?? "Dados da igreja inválidos",
      );
    }
    try {
      return await repo.createCompany(name, slugify(name), details.data);
    } catch (err) {
      if (err instanceof AppError && err.code === "conflict") {
        // Slug em uso: tenta uma vez com sufixo aleatório curto.
        const suffix = Math.random().toString(36).slice(2, 6);
        return repo.createCompany(name, `${slugify(name)}-${suffix}`, details.data);
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
      throw new AppError("forbidden", "Sem permissão para editar a igreja");
    }
    await repo.updateCompany(companyId, { name: parsed.data });
  }

  /** Papel do usuário na empresa; lança forbidden se não for membro ativo. */
  async function requireMembership(companyId: string): Promise<RoleCode> {
    const role = await repo.getMyRole(companyId);
    if (!role) {
      throw new AppError("forbidden", "Você não é membro desta igreja");
    }
    return role;
  }

  const MEMBERS_PAGE_SIZE = 20;

  async function listMembers(
    companyId: string,
    params?: PageParams,
  ): Promise<Paginated<MemberWithProfile>> {
    await requireMembership(companyId);
    const { page, pageSize, offset } = normalizePageParams(params, MEMBERS_PAGE_SIZE);
    const { items, total } = await repo.listMembers(companyId, { limit: pageSize, offset });
    return { items, total, page, pageSize };
  }

  async function changeMemberRole(
    companyId: string,
    memberId: string,
    newRole: RoleCode,
  ): Promise<{ previousRole: RoleCode; targetUserId: string }> {
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
    return { previousRole: target.role, targetUserId: target.user_id };
  }

  async function removeMember(
    companyId: string,
    memberId: string,
  ): Promise<{ removedRole: RoleCode; targetUserId: string }> {
    const actorRole = await requireMembership(companyId);
    const target = await repo.getMember(memberId, companyId);
    if (!target) {
      throw new AppError("not_found", "Membro não encontrado");
    }
    if (!permissionService.canRemoveMember(actorRole, target.role)) {
      throw new AppError("forbidden", "Sem permissão para remover este membro");
    }
    await repo.removeMember(memberId, companyId);
    return { removedRole: target.role, targetUserId: target.user_id };
  }

  async function leaveCompany(companyId: string): Promise<void> {
    const role = await requireMembership(companyId);
    if (role === "owner") {
      throw new AppError("forbidden", "O owner não pode sair da própria igreja");
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
