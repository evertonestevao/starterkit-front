import type { SupabaseClient } from "@supabase/supabase-js";
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
        .select("id, name, pix_chave, pix_titular")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return ((data ?? []) as Array<{
        id: string;
        name: string;
        pix_chave: string | null;
        pix_titular: string | null;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        pixChave: row.pix_chave,
        pixTitular: row.pix_titular,
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
