import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchHierarchyRepository, HierarchyChurch } from "@/services/churchHierarchyService";
import type { ChurchTipo } from "@/types/database";

/**
 * Árvore de igrejas pela plataforma. As duas RPCs checam
 * `is_platform_staff()` e a escrita fica registrada em
 * `platform_staff_actions` — nada aqui lê `churches` direto.
 */
export function createSupabaseChurchHierarchyRepository(client: SupabaseClient): ChurchHierarchyRepository {
  return {
    async listChurches(): Promise<HierarchyChurch[]> {
      const { data, error } = await client.rpc("platform_list_churches");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return ((data ?? []) as Array<{
        id: string;
        name: string;
        public_code: string;
        tipo: ChurchTipo;
        parent_id: string | null;
        path: string;
        company_id: string | null;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        publicCode: row.public_code,
        tipo: row.tipo,
        parentId: row.parent_id,
        path: row.path,
        companyId: row.company_id,
      }));
    },

    async setHierarchy({ churchId, tipo, parentId }) {
      const { error } = await client.rpc("platform_set_church_hierarchy", {
        p_church_id: churchId,
        p_tipo: tipo,
        p_parent_id: parentId,
      });
      if (!error) return;
      // 23514 = regra da árvore (trigger); a mensagem do banco não vai para a tela.
      if (error.code === "23514") {
        throw new AppError("validation_error", "Essa combinação de tipo e igreja superior não é permitida.", error);
      }
      if (error.code === "42501") {
        throw new AppError("forbidden", "Esta área é da moderação da plataforma.", error);
      }
      throw new AppError("internal_error", "Falha ao salvar a hierarquia", error);
    },
  };
}
