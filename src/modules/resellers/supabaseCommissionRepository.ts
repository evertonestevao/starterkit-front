import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CommissionFailure, CommissionRepository } from "./commissionService";

function raise(error: { message: string } | null, message: string): void {
  if (error) throw new AppError("internal_error", message, error);
}

/** Webhook não tem sessão: recebe o client admin, criado em ./server. */
export function createSupabaseCommissionRepository(adminClient: SupabaseClient): CommissionRepository {
  return {
    async findCompanyIdBySubscription(externalSubscriptionId) {
      const { data, error } = await adminClient
        .from("subscriptions")
        .select("company_id")
        .eq("external_subscription_id", externalSubscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ company_id: string }>();
      raise(error, "Falha ao buscar a assinatura");
      return data?.company_id ?? null;
    },

    async getPlanInterval(planId) {
      const { data, error } = await adminClient
        .from("plans")
        .select("billing_interval")
        .eq("id", planId)
        .maybeSingle<{ billing_interval: "month" | "year" }>();
      raise(error, "Falha ao buscar o plano");
      return data?.billing_interval ?? null;
    },

    async registerCommission({ companyId, gateway, externalPaymentId, grossAmountCents, monthsCovered }) {
      const { error } = await adminClient.rpc("register_commission", {
        p_company_id: companyId,
        p_gateway: gateway,
        p_external_payment_id: externalPaymentId,
        p_base_amount_cents: grossAmountCents,
        p_months_covered: monthsCovered,
      });
      raise(error, "Falha ao registrar comissão");
    },

    async reverseCommission(gateway, externalPaymentId, refundedCents) {
      const { error } = await adminClient.rpc("reverse_commission", {
        p_gateway: gateway,
        p_external_payment_id: externalPaymentId,
        p_refunded_cents: refundedCents,
      });
      raise(error, "Falha ao estornar comissão");
    },

    async endClient(companyId) {
      const { error } = await adminClient.rpc("end_reseller_client", { p_company_id: companyId });
      raise(error, "Falha ao encerrar o vínculo");
    },

    async recordFailure({ gateway, eventType, externalId, error: message, payload }) {
      const { error } = await adminClient.rpc("record_commission_failure", {
        p_gateway: gateway,
        p_event_type: eventType,
        p_external_id: externalId,
        p_error: message,
        p_payload: payload,
      });
      raise(error, "Falha ao gravar pendência de comissão");
    },

    async resolveFailure(gateway, eventType, externalId) {
      const { error } = await adminClient
        .from("reseller_commission_failures")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("gateway", gateway)
        .eq("event_type", eventType)
        .eq("external_id", externalId)
        .eq("status", "pending");
      raise(error, "Falha ao resolver pendência de comissão");
    },

    async getFailure(id) {
      const { data, error } = await adminClient
        .from("reseller_commission_failures")
        .select("id, status, payload")
        .eq("id", id)
        .maybeSingle<CommissionFailure>();
      raise(error, "Falha ao buscar pendência de comissão");
      return data;
    },
  };
}
