import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { AccountRemover, AccountRepository } from "@/services/accountService";
import type { Company, RoleCode, SubscriptionStatus } from "@/types/database";

/**
 * Implementação Supabase do AccountRepository, sempre com o client do usuário
 * logado: a RLS garante que só os dados do próprio titular aparecem.
 */
export function createSupabaseAccountRepository(client: SupabaseClient): AccountRepository {
  async function requireUserId(): Promise<string> {
    const { data } = await client.auth.getUser();
    if (!data.user) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    return data.user.id;
  }

  return {
    async getCurrentUser() {
      const { data } = await client.auth.getUser();
      if (!data.user?.email) return null;
      return { id: data.user.id, email: data.user.email, createdAt: data.user.created_at };
    },

    async listMyMemberships() {
      const userId = await requireUserId();
      const { data, error } = await client
        .from("company_members")
        .select("role, company:companies(id, name, deleted_at)")
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar empresas", error);
      }

      const memberships = (data ?? [])
        .map((row) => ({
          role: row.role as RoleCode,
          company: row.company as unknown as Pick<Company, "id" | "name" | "deleted_at"> | null,
        }))
        .filter((row) => row.company && !row.company.deleted_at);

      return Promise.all(
        memberships.map(async ({ role, company }) => {
          const companyId = company!.id;
          const { count, error: countError } = await client
            .from("company_members")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .is("deleted_at", null);
          if (countError) {
            throw new AppError("internal_error", "Falha ao contar membros", countError);
          }

          let subscriptionStatus: SubscriptionStatus | null = null;
          if (role === "owner") {
            const { data: subscription, error: subError } = await client
              .from("subscriptions")
              .select("status")
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .maybeSingle<{ status: SubscriptionStatus }>();
            if (subError) {
              throw new AppError("internal_error", "Falha ao checar assinatura", subError);
            }
            subscriptionStatus = subscription?.status ?? null;
          }

          return {
            companyId,
            companyName: company!.name,
            role,
            activeMembers: count ?? 0,
            subscriptionStatus,
          };
        }),
      );
    },

    async closeCompany(companyId) {
      const { data, error } = await client
        .from("companies")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao encerrar empresa", error);
      }
      if (!data || data.length === 0) {
        throw new AppError("not_found", "Empresa não encontrada");
      }
    },

    async collectMyData() {
      const userId = await requireUserId();
      const [profile, memberships, acceptances, consents] = await Promise.all([
        client.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle(),
        client
          .from("company_members")
          .select("role, created_at, company:companies(name)")
          .eq("user_id", userId)
          .is("deleted_at", null),
        client
          .from("terms_acceptances")
          .select("accepted_at, ip_address, user_agent, terms:terms_versions(version)")
          .eq("user_id", userId)
          .order("accepted_at", { ascending: true }),
        client
          .from("user_consents")
          .select("consent_type, granted, created_at, ip_address, user_agent")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);
      const failed = [profile, memberships, acceptances, consents].find((r) => r.error);
      if (failed?.error) {
        throw new AppError("internal_error", "Falha ao reunir seus dados", failed.error);
      }

      return {
        profile: profile.data
          ? { fullName: profile.data.full_name, avatarUrl: profile.data.avatar_url }
          : null,
        memberships: (memberships.data ?? []).map((row) => ({
          companyName: (row.company as unknown as { name: string } | null)?.name ?? "",
          role: row.role as RoleCode,
          since: row.created_at,
        })),
        termsAcceptances: (acceptances.data ?? []).map((row) => ({
          version: (row.terms as unknown as { version: number } | null)?.version ?? 0,
          acceptedAt: row.accepted_at,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
        })),
        consents: (consents.data ?? []).map((row) => ({
          type: row.consent_type,
          granted: row.granted,
          createdAt: row.created_at,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
        })),
      };
    },
  };
}

const AVATARS_BUCKET = "avatars";

/**
 * Exclusão definitiva com service_role. Recebe o client admin — só pode ser
 * construído em src/server. Apaga os arquivos do usuário e depois o usuário
 * do auth; o resto cai pelas FKs (profile e memberships em cascata, autoria
 * em auditoria/convites vira NULL).
 */
export function createSupabaseAccountRemover(adminClient: SupabaseClient): AccountRemover {
  return {
    async deleteUser(userId) {
      const storage = adminClient.storage.from(AVATARS_BUCKET);
      const { data: files, error: listError } = await storage.list(userId);
      if (listError) {
        throw new AppError("internal_error", "Falha ao listar arquivos do usuário", listError);
      }
      if (files && files.length > 0) {
        const { error: removeError } = await storage.remove(
          files.map((file) => `${userId}/${file.name}`),
        );
        if (removeError) {
          throw new AppError("internal_error", "Falha ao apagar arquivos do usuário", removeError);
        }
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) {
        throw new AppError("internal_error", "Falha ao excluir a conta", error);
      }
    },
  };
}
