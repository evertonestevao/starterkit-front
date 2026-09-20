import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlatformSettingsRepository } from "@/services/platformSettingsService";
import type { PlatformSettings } from "@/types/platform";

interface SettingsRow {
  vagas_primeiro_sede: number | null;
  vagas_primeiro_subsede: number | null;
  vagas_primeiro_congregacao: number | null;
  carencia_marca_dias: number;
  updated_at: string;
}

function toSettings(row: SettingsRow): PlatformSettings {
  return {
    vagasSede: row.vagas_primeiro_sede,
    vagasSubsede: row.vagas_primeiro_subsede,
    vagasCongregacao: row.vagas_primeiro_congregacao,
    carenciaMarcaDias: row.carencia_marca_dias,
    updatedAt: row.updated_at,
  };
}

/**
 * A tabela não tem policy nenhuma: o acesso é só por estas duas RPCs
 * security definer, que checam `is_platform_staff()` e registram a alteração
 * em `platform_staff_actions`.
 */
export function createSupabasePlatformSettingsRepository(
  client: SupabaseClient,
): PlatformSettingsRepository {
  return {
    async get(): Promise<PlatformSettings> {
      const { data, error } = await client.rpc("platform_get_settings").maybeSingle<SettingsRow>();
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao carregar as configurações", error);
      }
      return toSettings(data);
    },

    async update(input): Promise<PlatformSettings> {
      const { data, error } = await client
        .rpc("platform_update_settings", {
          p_vagas_sede: input.vagasSede,
          p_vagas_subsede: input.vagasSubsede,
          p_vagas_congregacao: input.vagasCongregacao,
          p_carencia_marca_dias: input.carenciaMarcaDias,
        })
        .maybeSingle<SettingsRow>();
      if (error?.code === "42501") {
        throw new AppError("forbidden", "Esta área é da moderação da plataforma.", error);
      }
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao salvar as configurações", error);
      }
      return toSettings(data);
    },
  };
}
