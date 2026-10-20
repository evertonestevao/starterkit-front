import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SaudacaoRepository } from "@/services/saudacaoService";

/** Saudação das mensagens, na própria linha da igreja (coluna `saudacao`). */
export function createSupabaseSaudacaoRepository(client: SupabaseClient): SaudacaoRepository {
  return {
    async get(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, saudacao")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1);
      if (error) throw new AppError("internal_error", "Falha ao carregar a saudação", error);
      const r = (data ?? [])[0] as { id: string; saudacao: string | null } | undefined;
      return r ? { churchId: r.id, saudacao: r.saudacao } : null;
    },

    async save(companyId, churchId, saudacao) {
      const { data, error } = await client
        .from("churches")
        .update({ saudacao })
        .eq("id", churchId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        if (error.code === "23514") {
          throw new AppError("validation_error", "A saudação precisa ter de 2 a 40 letras.", error);
        }
        throw new AppError("internal_error", "Falha ao salvar a saudação", error);
      }
      return (data ?? []).length > 0;
    },
  };
}
