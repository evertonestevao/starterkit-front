import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { InviteRepository } from "@/services/inviteService";
import type { CompanyInvite, CompanyMember } from "@/types/database";
import type { MyPendingInvite } from "@/types/tenant";

/**
 * Implementação Supabase do InviteRepository. Roda com o client do usuário
 * logado (anon + sessão): as RLS policies de company_invites garantem que só
 * owner/admin criam/revogam, e a RPC accept_company_invite valida o aceite.
 */
export function createSupabaseInviteRepository(client: SupabaseClient): InviteRepository {
  return {
    async createInvite(data) {
      const { data: row, error } = await client
        .from("company_invites")
        .insert({
          company_id: data.companyId,
          email: data.email,
          role: data.role,
          invited_by: data.invitedBy,
        })
        .select("*")
        .single<CompanyInvite>();
      if (error || !row) {
        // 23505 = unique_violation (convite pendente duplicado p/ mesmo email)
        if (error?.code === "23505") {
          throw new AppError("conflict", "Já existe um convite pendente para este email");
        }
        throw new AppError("internal_error", "Falha ao criar convite", error);
      }
      return row;
    },

    async revokeInvite(inviteId, companyId) {
      // company_id no filtro além do id: nunca aceitar ID solto sem validar
      // que pertence à empresa ativa (regra multi-tenant do CLAUDE.md).
      const { data, error } = await client
        .from("company_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId)
        .eq("company_id", companyId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao revogar convite", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Convite pendente não encontrado");
      }
    },

    async listPending(companyId) {
      const { data, error } = await client
        .from("company_invites")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar convites", error);
      }
      return (data ?? []) as CompanyInvite[];
    },

    async listMyPending() {
      const { data, error } = await client.rpc("my_pending_invites");
      if (error) {
        throw new AppError("internal_error", "Falha ao listar seus convites", error);
      }
      return (data ?? []) as MyPendingInvite[];
    },

    async acceptInvite(token) {
      const { data, error } = await client
        .rpc("accept_company_invite", { p_token: token })
        .single<CompanyMember>();
      if (error || !data) {
        // A RPC lança para token inválido/expirado/de outro email — a mensagem
        // interna fica no log; o usuário recebe um erro genérico e seguro.
        throw new AppError("forbidden", "Convite inválido ou expirado", error);
      }
      return data;
    },
  };
}
