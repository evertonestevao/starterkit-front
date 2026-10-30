import "server-only";
import { AppError } from "@/lib/errors";
import { getSupabaseServerClient } from "@/server/supabase-server";
import type { CommissionStatus, CommissionValue } from "./types";

export interface SellerMe {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  status: string;
}

export interface SellerPlan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  billing_interval: "month" | "year";
}

export interface SellerClient extends CommissionValue {
  id: string;
  client_name: string;
  plan_name: string | null;
  sale_number: number;
  duration_months: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface SellerCommission {
  id: string;
  client_name: string;
  base_amount_cents: number;
  amount_cents: number;
  status: CommissionStatus;
  created_at: string;
  paid_at: string | null;
}

/** A área do vendedor lê SOMENTE as views dele, com a sessão dele. */
export async function createSellerRepository() {
  const client = await getSupabaseServerClient();

  function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error) throw new AppError("internal_error", "Falha ao carregar seus dados", result.error);
    return result.data as T;
  }

  return {
    async getMe() {
      return unwrap(await client.from("reseller_me").select("*").maybeSingle<SellerMe>());
    },
    async isModuleEnabled() {
      return unwrap(await client.rpc("resellers_enabled")) === true;
    },
    async listAvailablePlans() {
      return unwrap(await client.from("reseller_available_plans").select("*").order("price_cents")) as SellerPlan[];
    },
    async listClients() {
      return unwrap(
        await client.from("reseller_my_clients").select("*").order("sale_number", { ascending: false }),
      ) as SellerClient[];
    },
    async listCommissions() {
      return unwrap(
        await client.from("reseller_my_commissions").select("*").order("created_at", { ascending: false }),
      ) as SellerCommission[];
    },
  };
}
