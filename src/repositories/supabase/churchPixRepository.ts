import type { SupabaseClient } from "@supabase/supabase-js";
import { statusDoPix } from "@/lib/pixStatus";
import { AppError } from "@/lib/errors";
import type { ChurchPixRepository } from "@/services/churchPixService";

/**
 * Chave PIX da igreja. O client do usuário basta: `churches` tem GRANT de
 * update só nas colunas certas e a policy exige admin da empresa dona. O
 * filtro por company_id é repetido aqui, como manda o CLAUDE.md.
 */
export function createSupabaseChurchPixRepository(client: SupabaseClient): ChurchPixRepository {
  return {
    async listCompanyChurches(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name, pix_chave, pix_titular, pix_aprovado_em, pix_recusado_em, pix_recusa_motivo")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return ((data ?? []) as Array<{
        id: string;
        name: string;
        pix_chave: string | null;
        pix_titular: string | null;
        pix_aprovado_em: string | null;
        pix_recusado_em: string | null;
        pix_recusa_motivo: string | null;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        pixChave: row.pix_chave,
        pixTitular: row.pix_titular,
        pixStatus: statusDoPix({ chave: row.pix_chave, aprovadoEm: row.pix_aprovado_em, recusadoEm: row.pix_recusado_em }),
        pixMotivoRecusa: row.pix_recusa_motivo,
      }));
    },

    async updatePix({ churchId, companyId, chave, titular }) {
      const { error } = await client
        .from("churches")
        .update({ pix_chave: chave, pix_titular: titular })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao salvar a chave PIX", error);
    },

    async listCompanyAdminEmails(companyId) {
      const { data, error } = await client.rpc("company_admin_emails", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os administradores", error);
      return ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
    },
  };
}
