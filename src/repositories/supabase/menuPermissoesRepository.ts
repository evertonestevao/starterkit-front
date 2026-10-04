import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { LinhaAcesso } from "@/lib/menuPermissoes";
import type { MenuPermissoesRepository } from "@/services/menuPermissoesService";

/**
 * Acessos por cargo. Não há leitura nem escrita direta em cargo_acessos: as
 * RPCs conferem a empresa e o papel de quem chama.
 */
export function createSupabaseMenuPermissoesRepository(client: SupabaseClient): MenuPermissoesRepository {
  return {
    async listarDaRede(companyId) {
      const { data, error } = await client.rpc("cargo_acessos_da_rede", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os acessos", error);
      return (data ?? []) as LinhaAcesso[];
    },

    async listarCargos(companyId) {
      const { data: church, error: churchError } = await client
        .from("churches")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (churchError) throw new AppError("internal_error", "Falha ao carregar a igreja", churchError);
      if (!church) return [];

      const { data, error } = await client.rpc("cargos_visiveis", { p_church: church.id });
      if (error) throw new AppError("internal_error", "Falha ao carregar os cargos", error);
      return ((data ?? []) as Array<{ id: string; nome: string; deleted_at: string | null }>)
        .filter((c) => c.deleted_at === null)
        .map((c) => ({ id: c.id, nome: c.nome }));
    },

    async salvar(companyId, itens) {
      const { error } = await client.rpc("salvar_cargo_acessos", {
        p_company_id: companyId,
        p_itens: itens.map((i) => ({ cargo_id: i.cargoId, modulo: i.modulo, permitido: i.permitido })),
      });
      if (error) {
        if (error.code === "42501") {
          throw new AppError("forbidden", "Só o responsável pela igreja altera os acessos.", error);
        }
        throw new AppError("internal_error", "Falha ao salvar os acessos", error);
      }
    },
  };
}
