import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { NomesNiveis } from "@/lib/niveisRede";
import type { IgrejaDaRede, NiveisRedeRepository } from "@/services/niveisRedeService";

interface Linha {
  sede_singular: string;
  sede_plural: string;
  subsede_singular: string;
  subsede_plural: string;
  congregacao_singular: string;
  congregacao_plural: string;
}

/**
 * Nomes dos níveis da rede. A tabela não é lida direto: as funções do banco
 * sobem a árvore até a sede (o que a RLS de quem está embaixo não deixaria) e
 * conferem quem pode gravar.
 */
export function createSupabaseNiveisRedeRepository(client: SupabaseClient): NiveisRedeRepository {
  return {
    async get(churchId) {
      const { data, error } = await client.rpc("nomes_dos_niveis", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os nomes dos níveis", error);
      const r = ((data ?? []) as Linha[])[0];
      if (!r) return null;
      return {
        sede: { singular: r.sede_singular, plural: r.sede_plural },
        subsede: { singular: r.subsede_singular, plural: r.subsede_plural },
        congregacao: { singular: r.congregacao_singular, plural: r.congregacao_plural },
      } satisfies NomesNiveis;
    },

    async igrejaDaEmpresa(companyId, churchId) {
      let q = client
        .from("churches")
        .select("id, tipo, parent_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1);
      if (churchId) q = q.eq("id", churchId);
      const { data, error } = await q;
      if (error) throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      const r = (data ?? [])[0] as { id: string; tipo: IgrejaDaRede["tipo"]; parent_id: string | null } | undefined;
      return r ? { id: r.id, tipo: r.tipo, parentId: r.parent_id } : null;
    },

    async save(churchId, nomes) {
      const { error } = await client.rpc("salvar_nomes_dos_niveis", {
        p_church_id: churchId,
        p_nomes: nomes
          ? {
              sede_singular: nomes.sede.singular,
              sede_plural: nomes.sede.plural,
              subsede_singular: nomes.subsede.singular,
              subsede_plural: nomes.subsede.plural,
              congregacao_singular: nomes.congregacao.singular,
              congregacao_plural: nomes.congregacao.plural,
            }
          : null,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.", error);
        if (error.code === "42501") {
          throw new AppError("forbidden", "Só o Responsável da sede define os nomes dos níveis da rede.", error);
        }
        if (error.code === "23514" || error.code === "23502") {
          throw new AppError("validation_error", "Confira os nomes: de 2 a 30 letras em cada um.", error);
        }
        throw new AppError("internal_error", "Falha ao salvar os nomes dos níveis", error);
      }
    },
  };
}
