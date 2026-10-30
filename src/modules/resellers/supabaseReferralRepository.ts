import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ReferralRepository } from "./referralService";

/** Funções restritas ao service_role: recebe o client admin, criado em ./server. */
export function createSupabaseReferralRepository(adminClient: SupabaseClient): ReferralRepository {
  return {
    async isValidCode(code) {
      const { data, error } = await adminClient.rpc("is_valid_referral_code", { p_code: code });
      if (error) {
        throw new AppError("internal_error", "Falha ao validar código de indicação", error);
      }
      return data === true;
    },

    async recordCompanyReferral(companyId, code, userId) {
      const { data, error } = await adminClient.rpc("record_company_referral", {
        p_company_id: companyId,
        p_referral_code: code,
        p_user_id: userId,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao gravar indicação", error);
      }
      return (data as string | null) ?? null;
    },
  };
}
