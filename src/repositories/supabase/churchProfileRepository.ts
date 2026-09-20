import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchProfile, ChurchProfileRepository } from "@/services/churchProfileService";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

/**
 * Página da igreja. O client do usuário basta: `churches` tem GRANT por
 * COLUNA e a policy exige admin da empresa dona. O filtro por company_id vai
 * junto de toda escrita, como manda o CLAUDE.md.
 */
export function createSupabaseChurchProfileRepository(
  client: SupabaseClient,
): ChurchProfileRepository {
  return {
    async listCompanyChurches(companyId): Promise<ChurchProfile[]> {
      const { data, error } = await client
        .from("churches")
        .select("id, name, public_code, address, logo_url, social_links")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return ((data ?? []) as Array<{
        id: string;
        name: string;
        public_code: string;
        address: string | null;
        logo_url: string | null;
        social_links: Record<string, string> | null;
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        publicCode: row.public_code,
        address: row.address,
        logoUrl: row.logo_url,
        socialLinks: row.social_links ?? {},
      }));
    },

    async updateProfile({ churchId, companyId, name, address, publicCode, socialLinks }) {
      const { error } = await client
        .from("churches")
        .update({
          name,
          address,
          public_code: publicCode,
          social_links: socialLinks,
        })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (!error) return;
      if (error.code === UNIQUE_VIOLATION) {
        throw new AppError(
          "conflict",
          "Esse endereço já é de outra igreja. Escolha outro — por exemplo com o nome da cidade.",
          error,
        );
      }
      if (error.code === CHECK_VIOLATION) {
        throw new AppError("validation_error", "Endereço público em formato inválido.", error);
      }
      throw new AppError("internal_error", "Falha ao salvar a página da igreja", error);
    },

    async updateLogo({ churchId, companyId, logoUrl }) {
      const { error } = await client
        .from("churches")
        .update({ logo_url: logoUrl })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao salvar o logo", error);
    },
  };
}
