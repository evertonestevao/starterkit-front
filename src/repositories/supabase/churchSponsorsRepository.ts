import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanySponsor, CompanySponsorsRepository } from "@/services/churchSponsorsService";

/**
 * Lê os patrocinadores da empresa pela RPC list_company_sponsors — a igreja
 * não tem (nem deve ter) acesso à tabela sponsor_accounts.
 */
export function createSupabaseChurchSponsorsRepository(
  client: SupabaseClient,
): CompanySponsorsRepository {
  return {
    async listByCompany(companyId) {
      const { data, error } = await client.rpc("list_company_sponsors", {
        p_company_id: companyId,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar patrocinadores", error);
      }
      return ((data ?? []) as Array<{
        sponsorship_id: string;
        church_id: string;
        church_name: string;
        sponsor_name: string;
        logo_url: string | null;
        status: CompanySponsor["status"];
        activated_at: string | null;
        ends_at: string | null;
      }>).map((row) => ({
        sponsorshipId: row.sponsorship_id,
        churchId: row.church_id,
        churchName: row.church_name,
        sponsorName: row.sponsor_name,
        logoUrl: row.logo_url,
        status: row.status,
        activatedAt: row.activated_at,
        endsAt: row.ends_at,
      }));
    },
  };
}
