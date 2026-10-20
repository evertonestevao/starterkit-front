import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { TermsRepository } from "@/services/termsService";
import type { TermsAcceptance, TermsVersion, UserConsent } from "@/types/database";

/**
 * Implementação Supabase do TermsRepository. Client do usuário logado: a RLS
 * garante que aceites/consentimentos só são lidos/gravados em nome próprio.
 */
export function createSupabaseTermsRepository(client: SupabaseClient): TermsRepository {
  async function currentUserId(): Promise<string> {
    const { data } = await client.auth.getUser();
    if (!data.user) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    return data.user.id;
  }

  return {
    async getCurrentVersion() {
      const { data, error } = await client
        .from("terms_versions")
        .select("*")
        .eq("is_current", true)
        .maybeSingle<TermsVersion>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar os termos", error);
      }
      return data;
    },

    async findMyAcceptance(termsVersionId) {
      const { data, error } = await client
        .from("terms_acceptances")
        .select("*")
        .eq("terms_version_id", termsVersionId)
        .maybeSingle<TermsAcceptance>();
      if (error) {
        throw new AppError("internal_error", "Falha ao checar aceite dos termos", error);
      }
      return data;
    },

    async insertAcceptance({ termsVersionId, ipAddress, userAgent }) {
      const { error } = await client.from("terms_acceptances").insert({
        user_id: await currentUserId(),
        terms_version_id: termsVersionId,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
      // 23505: aceite duplicado da mesma versão — corrida benigna, ignora.
      if (error && error.code !== "23505") {
        throw new AppError("internal_error", "Falha ao registrar aceite", error);
      }
    },

    async insertConsent({ consentType, granted, ipAddress, userAgent }) {
      const { error } = await client.from("user_consents").insert({
        user_id: await currentUserId(),
        consent_type: consentType,
        granted,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar consentimento", error);
      }
    },

    async getLatestConsent(consentType) {
      const { data, error } = await client
        .from("user_consents")
        .select("granted")
        .eq("consent_type", consentType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<UserConsent, "granted">>();
      if (error) {
        throw new AppError("internal_error", "Falha ao consultar consentimento", error);
      }
      return data;
    },
  };
}
