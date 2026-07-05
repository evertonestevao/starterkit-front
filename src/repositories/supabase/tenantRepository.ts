import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { TenantRepository } from "@/services/tenantService";
import type { Company, CompanyMember, RoleCode } from "@/types/database";
import type { CompanyWithRole, MemberWithProfile } from "@/types/tenant";

/**
 * Implementação Supabase do TenantRepository. Sempre com o client do usuário
 * logado (RLS ativa); filtros por company_id replicados nas queries.
 */
export function createSupabaseTenantRepository(client: SupabaseClient): TenantRepository {
  return {
    async listMyCompanies() {
      // Membership do usuário + empresa embutida (FK company_id -> companies).
      const { data, error } = await client
        .from("company_members")
        .select("role, company:companies(*)")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar empresas", error);
      }
      return (data ?? [])
        .filter((row) => row.company && !(row.company as unknown as Company).deleted_at)
        .map((row) => ({
          ...(row.company as unknown as Company),
          role: row.role as RoleCode,
        }));
    },

    async createCompany(name, slug) {
      const { data, error } = await client
        .rpc("create_company", { p_name: name, p_slug: slug })
        .single<Company>();
      if (error || !data) {
        if (error?.code === "23505") {
          throw new AppError("conflict", "Já existe uma empresa com esse identificador");
        }
        throw new AppError("internal_error", "Falha ao criar empresa", error);
      }
      return { ...data, role: "owner" as const };
    },

    async updateCompany(companyId, { name }) {
      const { data, error } = await client
        .from("companies")
        .update({ name })
        .eq("id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao atualizar empresa", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Empresa não encontrada");
      }
    },

    async getMyRole(companyId) {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      const { data: member, error: memberError } = await client
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", data.user.id)
        .is("deleted_at", null)
        .maybeSingle<Pick<CompanyMember, "role">>();
      if (memberError) {
        throw new AppError("internal_error", "Falha ao checar membership", memberError);
      }
      return member?.role ?? null;
    },

    async listMembers(companyId) {
      const { data, error } = await client
        .from("company_members")
        .select("*, profile:profiles(full_name, avatar_url)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar membros", error);
      }
      return (data ?? []) as unknown as MemberWithProfile[];
    },

    async getMember(memberId, companyId) {
      const { data, error } = await client
        .from("company_members")
        .select("*, profile:profiles(full_name, avatar_url)")
        .eq("id", memberId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        throw new AppError("internal_error", "Falha ao buscar membro", error);
      }
      return data as unknown as MemberWithProfile | null;
    },

    async updateMemberRole(memberId, companyId, role) {
      const { data, error } = await client
        .from("company_members")
        .update({ role })
        .eq("id", memberId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao alterar papel", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Membro não encontrado");
      }
    },

    async removeMember(memberId, companyId) {
      const { data, error } = await client
        .from("company_members")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", memberId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao remover membro", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Membro não encontrado");
      }
    },

    async leaveCompany(companyId) {
      const { error } = await client.rpc("leave_company", { p_company_id: companyId });
      if (error) {
        throw new AppError("internal_error", "Falha ao sair da empresa", error);
      }
    },
  };
}
