import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { LinhaModulo } from "@/lib/menuPermissoes";
import type { ModuloAtivoRepository } from "@/services/moduloAtivoService";

/**
 * Módulos ativos por igreja. Não há leitura nem escrita direta em
 * church_modulos: as RPCs conferem a empresa e o papel de quem chama.
 */
export function createSupabaseModuloAtivoRepository(client: SupabaseClient): ModuloAtivoRepository {
  return {
    async listarDaRede(companyId) {
      const { data, error } = await client.rpc("modulos_ativos_da_rede", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os módulos", error);
      return (data ?? []) as LinhaModulo[];
    },

    async salvar(companyId, itens) {
      const { error } = await client.rpc("salvar_modulos_ativos", {
        p_company_id: companyId,
        p_itens: itens.map((i) => ({ modulo: i.modulo, ativo: i.ativo })),
      });
      if (error) {
        if (error.code === "42501") {
          throw new AppError("forbidden", "Só quem administra a igreja liga ou desliga módulos.", error);
        }
        throw new AppError("internal_error", "Falha ao salvar os módulos", error);
      }
    },
  };
}
