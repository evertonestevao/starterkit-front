import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { acessosDaPessoa } from "@/lib/menuPermissoes";
import type { TenantRepository } from "@/services/tenantService";
import type { Company, CompanyMember, RoleCode } from "@/types/database";
import type { MemberWithProfile } from "@/types/tenant";

/**
 * Implementação Supabase do TenantRepository. Sempre com o client do usuário
 * logado (RLS ativa); filtros por company_id replicados nas queries.
 */
export function createSupabaseTenantRepository(client: SupabaseClient): TenantRepository {
  return {
    async listMyCompanies() {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) return [];
      // Membership do usuário + empresa embutida (FK company_id -> companies).
      // O filtro por user_id é obrigatório: a RLS de company_members deixa
      // qualquer membro ler a equipe inteira, e sem ele o papel exibido podia
      // ser o de outra pessoa da mesma empresa (o owner, que vem primeiro).
      const { data, error } = await client
        .from("company_members")
        .select("role, company:companies(*)")
        .eq("user_id", auth.user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar igrejas", error);
      }
      // Onde a pessoa ensina na EBD (para o menu). Falhar aqui não derruba o painel.
      const { data: professor } = await client.rpc("minhas_empresas_professor_ebd");
      const ensinaEm = new Set(((professor ?? []) as unknown as string[]).map(String));
      // Módulos liberados pelos cargos da pessoa, por empresa. Falhar aqui
      // deixa só o acesso do papel — nunca libera a mais.
      const { data: liberados } = await client.rpc("meus_acessos");
      const porCargo = new Map<string, string[]>();
      for (const l of (liberados ?? []) as Array<{ company_id: string; modulo: string }>) {
        porCargo.set(l.company_id, [...(porCargo.get(l.company_id) ?? []), l.modulo]);
      }
      const companies = (data ?? [])
        .filter((row) => row.company && !(row.company as unknown as Company).deleted_at)
        .map((row) => {
          const company = row.company as unknown as Company;
          const acessos = acessosDaPessoa(porCargo.get(company.id) ?? []);
          return {
            ...company,
            role: row.role as RoleCode,
            pode_acompanhar: acessos.includes("acompanhamento") || acessos.includes("membros"),
            pode_gerir_ebd: acessos.includes("ebd"),
            professor_ebd: ensinaEm.has(company.id),
            acessos,
          };
        });
      // Dedup defensivo por id: o índice único parcial de company_members já
      // impede membership dupla, mas a UI usa company.id como React key —
      // um duplicado aqui quebraria o switcher inteiro.
      const seen = new Set<string>();
      return companies.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    },

    async createCompany(name, slug, church) {
      // create_company_with_church: empresa + owner + IGREJA numa transação
      // só. Empresa sem igreja não tem página pública, QR Code, domínio nem
      // link de patrocínio — e não há tela que conserte isso depois.
      const { data, error } = await client
        .rpc("create_company_with_church", {
          p_name: name,
          p_slug: slug,
          p_sobrenome: church.sobrenome,
          p_faz_parte_de_rede: church.fazParteDeRede,
          p_rede_nome: church.redeNome,
        })
        .single<Company>();
      if (error || !data) {
        if (error?.code === "23505") {
          throw new AppError("conflict", "Já existe uma igreja com esse identificador");
        }
        throw new AppError("internal_error", "Falha ao criar igreja", error);
      }
      return {
        ...data,
        role: "owner" as const,
        pode_acompanhar: false,
        pode_gerir_ebd: false,
        professor_ebd: false,
        acessos: [],
      };
    },

    async updateCompany(companyId, { name }) {
      const { data, error } = await client
        .from("companies")
        .update({ name })
        .eq("id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao atualizar igreja", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Igreja não encontrada");
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

    async listMembers(companyId, { limit, offset }) {
      const { data, error, count } = await client
        .from("company_members")
        // FK explícita: há duas relações com profiles (user_id e invited_by)
        .select("*, profile:profiles!company_members_user_id_fkey(full_name, avatar_url)", {
          count: "exact",
        })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar membros", error);
      }
      return {
        items: (data ?? []) as unknown as MemberWithProfile[],
        total: count ?? 0,
      };
    },

    async getMember(memberId, companyId) {
      const { data, error } = await client
        .from("company_members")
        // FK explícita: há duas relações com profiles (user_id e invited_by)
        .select("*, profile:profiles!company_members_user_id_fkey(full_name, avatar_url)")
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

    async definirResponsavel(memberId, tornar) {
      const { data, error } = await client.rpc("definir_responsavel", {
        p_member_id: memberId,
        p_responsavel: tornar,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado");
        if (error.code === "23514") {
          throw new AppError(
            "validation_error",
            "A igreja precisa de pelo menos um Responsável. Defina outro antes de tirar este.",
          );
        }
        throw new AppError("internal_error", "Falha ao definir o Responsável", error);
      }
      return (data ?? []) as Array<{ email: string; afetado: boolean }>;
    },

    async leaveCompany(companyId) {
      const { error } = await client.rpc("leave_company", { p_company_id: companyId });
      if (error) {
        throw new AppError("internal_error", "Falha ao sair da igreja", error);
      }
    },
  };
}
