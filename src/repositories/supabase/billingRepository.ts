import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { BillingRepository } from "@/services/billingService";
import type { Plan, Subscription } from "@/types/database";

/**
 * Implementação Supabase do BillingRepository. Recebe o client de fora:
 * anon (RLS ativa) para leituras vindas da UI, service_role para webhooks —
 * quem decide é o chamador (service/route handler), nunca este arquivo.
 */
export function createSupabaseBillingRepository(client: SupabaseClient): BillingRepository {
  function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T | null {
    if (result.error) {
      throw new AppError("internal_error", "Falha ao acessar dados de billing", result.error);
    }
    return result.data;
  }

  return {
    async getPlanById(planId) {
      const result = await client
        .from("plans")
        .select("*")
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle<Plan>();
      return unwrap(result);
    },

    async getPlanByCode(code) {
      const result = await client
        .from("plans")
        .select("*")
        .eq("code", code)
        .is("deleted_at", null)
        .maybeSingle<Plan>();
      return unwrap(result);
    },

    async getActiveSubscription(companyId) {
      const result = await client
        .from("subscriptions")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle<Subscription>();
      return unwrap(result);
    },

    async findSubscriptionByExternalId(externalId) {
      const result = await client
        .from("subscriptions")
        .select("*")
        .eq("external_subscription_id", externalId)
        .is("deleted_at", null)
        .maybeSingle<Subscription>();
      return unwrap(result);
    },

    async insertSubscription(data) {
      const result = await client
        .from("subscriptions")
        .insert(data)
        .select("*")
        .single<Subscription>();
      const row = unwrap(result);
      if (!row) throw new AppError("internal_error", "Insert de assinatura não retornou linha");
      return row;
    },

    async updateSubscription(id, data) {
      const result = await client
        .from("subscriptions")
        .update(data)
        .eq("id", id)
        .select("*")
        .single<Subscription>();
      const row = unwrap(result);
      if (!row) throw new AppError("internal_error", "Update de assinatura não retornou linha");
      return row;
    },
  };
}
