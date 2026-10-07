import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlatformPricingRepository } from "@/services/platformPricingService";
import type { PriceTier } from "@/services/sponsorPricing";

interface TierRow {
  position: number;
  amount_cents: number;
}

function toTier(row: TierRow): PriceTier {
  return { position: row.position, amountCents: row.amount_cents };
}

/**
 * Leitura direta (a tabela tem SELECT público — ver 20260917120000). Escrita
 * só pela RPC `platform_update_sponsor_price_tiers`, security definer.
 */
export function createSupabasePlatformPricingRepository(
  client: SupabaseClient,
): PlatformPricingRepository {
  return {
    async getTiers(): Promise<PriceTier[]> {
      const { data, error } = await client
        .from("sponsor_price_tiers")
        .select("position, amount_cents")
        .order("position", { ascending: true });
      if (error) throw new AppError("internal_error", "Falha ao carregar a tabela de preços", error);
      return ((data ?? []) as TierRow[]).map(toTier);
    },

    async updateTiers(tiers: PriceTier[]): Promise<PriceTier[]> {
      const { data, error } = await client.rpc("platform_update_sponsor_price_tiers", {
        p_tiers: tiers.map((t) => ({ position: t.position, amount_cents: t.amountCents })),
      });
      if (error?.code === "42501") {
        throw new AppError("forbidden", "Esta área é da moderação da plataforma.", error);
      }
      if (error) throw new AppError("internal_error", "Falha ao salvar a tabela de preços", error);
      return ((data ?? []) as TierRow[]).map(toTier);
    },
  };
}
