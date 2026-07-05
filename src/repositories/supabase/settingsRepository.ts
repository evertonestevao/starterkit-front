import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SettingsReader } from "@/services/featureFlagService";
import type { Setting } from "@/types/database";

/** Leitura/escrita da tabela settings (par chave/valor por empresa). */
export function createSupabaseSettingsRepository(client: SupabaseClient) {
  const reader: SettingsReader = {
    async getValue(companyId, key) {
      const { data, error } = await client
        .from("settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", key)
        .is("deleted_at", null)
        .maybeSingle<Pick<Setting, "value">>();
      if (error) {
        throw new AppError("internal_error", "Falha ao ler configuração", error);
      }
      return data?.value;
    },
  };

  return {
    ...reader,

    async setValue(companyId: string, key: string, value: unknown): Promise<void> {
      // Upsert manual: update da linha ativa; se não existir, insert.
      // (onConflict não serve aqui: o índice único é parcial, com deleted_at null.)
      const { data, error } = await client
        .from("settings")
        .update({ value })
        .eq("company_id", companyId)
        .eq("key", key)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        throw new AppError("internal_error", "Falha ao gravar configuração", error);
      }
      if (data && data.length > 0) return;

      const { error: insertError } = await client
        .from("settings")
        .insert({ company_id: companyId, key, value });
      if (insertError) {
        throw new AppError("internal_error", "Falha ao gravar configuração", insertError);
      }
    },
  };
}
