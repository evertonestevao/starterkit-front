import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CommissionFilters } from "./schemas";
import type {
  AdminClient,
  AdminCommission,
  AdminLinkAlert,
  AdminReseller,
  CommissionFailureRow,
  CommissionRuleRow,
  ResellerAuditEntry,
  ResellerPlanRow,
} from "./types";

function ensure<T>(result: { data: T | null; error: { message: string; code?: string } | null }, message: string): T {
  if (result.error) {
    if (result.error.code === "23505") {
      throw new AppError("conflict", "Já existe um registro com estes dados", result.error);
    }
    throw new AppError("internal_error", message, result.error);
  }
  return result.data as T;
}

/**
 * Leituras e escritas do painel com o client da SESSÃO do super admin: a RLS vale e o
 * histórico registra quem mudou. Nada aqui usa service_role.
 */
export function createResellerAdminRepository(client: SupabaseClient) {
  return {
    async getSettings() {
      return ensure(
        await client
          .from("reseller_settings")
          .select("resellers_enabled, client_return_window_days")
          .single<{ resellers_enabled: boolean; client_return_window_days: number }>(),
        "Falha ao ler a configuração",
      );
    },

    async setModuleEnabled(enabled: boolean) {
      ensure(
        await client.from("reseller_settings").update({ resellers_enabled: enabled }).eq("singleton", true),
        "Falha ao alterar o módulo",
      );
    },

    async listResellers() {
      return ensure(
        await client.from("reseller_admin_totals").select("*").order("created_at", { ascending: false }),
        "Falha ao listar vendedores",
      ) as AdminReseller[];
    },

    async getReseller(id: string) {
      return ensure(
        await client.from("reseller_admin_totals").select("*").eq("id", id).maybeSingle<AdminReseller>(),
        "Falha ao ler o vendedor",
      );
    },

    async findConflict(email: string, referralCode: string) {
      const { data, error } = await client
        .from("resellers")
        .select("id")
        .or(`email.eq.${email},referral_code.eq.${referralCode}`)
        .limit(1);
      if (error) throw new AppError("internal_error", "Falha ao checar duplicidade", error);
      return (data ?? []).length > 0;
    },

    async insertReseller(data: { name: string; email: string; referral_code: string; user_id: string }) {
      ensure(await client.from("resellers").insert(data), "Falha ao cadastrar o vendedor");
    },

    async updateReseller(id: string, data: { name?: string; referral_code?: string; status?: string }) {
      ensure(await client.from("resellers").update(data).eq("id", id), "Falha ao alterar o vendedor");
    },

    async listRules() {
      return ensure(
        await client
          .from("commission_rules")
          .select("*")
          .is("deleted_at", null)
          .order("reseller_id", { ascending: true, nullsFirst: true })
          .order("plan_id", { ascending: true, nullsFirst: true })
          .order("from_sale_number"),
        "Falha ao listar regras",
      ) as CommissionRuleRow[];
    },

    async insertRule(data: Record<string, unknown>) {
      ensure(await client.from("commission_rules").insert(data), "Falha ao criar a regra");
    },

    async deleteRule(id: string) {
      ensure(
        await client.from("commission_rules").update({ deleted_at: new Date().toISOString() }).eq("id", id),
        "Falha ao remover a regra",
      );
    },

    async listPlans() {
      return ensure(
        await client
          .from("plans")
          .select("id, code, name, price_cents, available_to_resellers")
          .is("deleted_at", null)
          .order("price_cents"),
        "Falha ao listar planos",
      ) as ResellerPlanRow[];
    },

    async setPlanAvailable(planId: string, available: boolean) {
      const { error } = await client.rpc("set_plan_available_to_resellers", {
        p_plan_id: planId,
        p_available: available,
      });
      if (error) throw new AppError("internal_error", "Falha ao alterar o plano", error);
    },

    async listClients(resellerId: string) {
      return ensure(
        await client
          .from("reseller_admin_clients")
          .select("*")
          .eq("reseller_id", resellerId)
          .order("sale_number", { ascending: false }),
        "Falha ao listar clientes",
      ) as AdminClient[];
    },

    async updateClientCommission(id: string, data: Record<string, unknown>) {
      ensure(
        await client.from("reseller_clients").update({ ...data, is_override: true }).eq("id", id),
        "Falha ao alterar a comissão",
      );
    },

    async listHistory(tableName: string, recordIds: string[]) {
      if (recordIds.length === 0) return [];
      return ensure(
        await client
          .from("reseller_audit_log")
          .select("id, table_name, record_id, action, changed_by, old_values, new_values, changed_at")
          .eq("table_name", tableName)
          .in("record_id", recordIds)
          .order("changed_at", { ascending: false })
          .limit(100),
        "Falha ao ler o histórico",
      ) as ResellerAuditEntry[];
    },

    async listCommissions(filters: CommissionFilters, limit: number) {
      let query = client
        .from("reseller_admin_commissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (filters.reseller) query = query.eq("reseller_id", filters.reseller);
      if (filters.plan) query = query.eq("plan_id", filters.plan);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
      return ensure(await query, "Falha ao listar lançamentos") as AdminCommission[];
    },

    async updateCommissionAmount(id: string, amountCents: number) {
      ensure(
        await client.from("reseller_commissions").update({ amount_cents: amountCents }).eq("id", id),
        "Falha ao alterar o lançamento",
      );
    },

    /** Só pendentes: repetir a ação não muda a data de quem já foi pago. */
    async markCommissionsPaid(ids: string[], paidAt: string) {
      const data = ensure(
        await client
          .from("reseller_commissions")
          .update({ status: "paid", paid_at: `${paidAt}T12:00:00Z` })
          .in("id", ids)
          .eq("status", "pending")
          .select("id"),
        "Falha ao marcar como pago",
      ) as Array<{ id: string }>;
      return data.length;
    },

    async listLinkAlerts() {
      return ensure(
        await client.from("reseller_admin_link_alerts").select("*").order("changed_at", { ascending: false }),
        "Falha ao ler os alertas",
      ) as AdminLinkAlert[];
    },

    async linkFromAlert(alertId: number) {
      const { data, error } = await client.rpc("link_company_from_alert", { p_alert_id: alertId });
      if (error) throw new AppError("internal_error", "Falha ao vincular o cliente", error);
      return (data as string | null) ?? null;
    },

    async listPendingFailures() {
      return ensure(
        await client
          .from("reseller_commission_failures")
          .select("id, gateway, event_type, external_id, error, attempts, created_at, updated_at")
          .eq("status", "pending")
          .order("created_at"),
        "Falha ao ler as pendências",
      ) as CommissionFailureRow[];
    },
  };
}

export type ResellerAdminRepository = ReturnType<typeof createResellerAdminRepository>;
