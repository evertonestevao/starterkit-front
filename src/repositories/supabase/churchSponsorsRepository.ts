import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanySponsor, CompanySponsorsRepository } from "@/services/churchSponsorsService";

interface CompanySponsorRow {
  sponsorship_id: string;
  church_id: string;
  church_name: string;
  sponsor_name: string;
  logo_url: string | null;
  status: CompanySponsor["status"];
  activated_at: string | null;
  ends_at: string | null;
  hidden_at: string | null;
  denuncia_aberta: boolean;
  em_carencia: boolean;
}

/**
 * Lê os patrocinadores da empresa pela RPC list_company_sponsors — a igreja
 * não tem (nem deve ter) acesso à tabela sponsor_accounts. Esconder e
 * denunciar também são RPCs: `sponsorships` não tem GRANT de update para o
 * client.
 */
export function createSupabaseChurchSponsorsRepository(
  client: SupabaseClient,
  adminClient: SupabaseClient,
): CompanySponsorsRepository {
  return {
    async listByCompany(companyId) {
      const { data, error } = await client.rpc("list_company_sponsors", {
        p_company_id: companyId,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar patrocinadores", error);
      }
      return ((data ?? []) as CompanySponsorRow[]).map((row) => ({
        sponsorshipId: row.sponsorship_id,
        churchId: row.church_id,
        churchName: row.church_name,
        sponsorName: row.sponsor_name,
        logoUrl: row.logo_url,
        status: row.status,
        activatedAt: row.activated_at,
        endsAt: row.ends_at,
        hiddenAt: row.hidden_at,
        denunciaAberta: row.denuncia_aberta,
        emCarencia: row.em_carencia,
      }));
    },

    async setHidden({ sponsorshipId, hidden, reason }) {
      const { error } = await client.rpc("set_sponsorship_hidden", {
        p_sponsorship_id: sponsorshipId,
        p_hidden: hidden,
        p_reason: reason,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao atualizar o patrocinador", error);
      }
    },

    async reportAbuse({ sponsorshipId, motivo }) {
      const { data, error } = await client.rpc("report_sponsor_abuse", {
        p_sponsorship_id: sponsorshipId,
        p_motivo: motivo,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar a denúncia", error);
      }
      return data as string;
    },

    /**
     * Contagem feita com `service_role`, nunca com o client da igreja: saber
     * que OUTRAS igrejas escondem o mesmo patrocinador é informação da
     * moderação, não dela. O número só existe para disparar o alerta e nunca
     * volta para o navegador.
     */
    async countHidesForSponsorOf(sponsorshipId) {
      const { data: sponsorship } = await adminClient
        .from("sponsorships")
        .select("sponsor_id")
        .eq("id", sponsorshipId)
        .maybeSingle();
      if (!sponsorship) return 0;

      const { count, error } = await adminClient
        .from("sponsorships")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", sponsorship.sponsor_id as string)
        .not("hidden_at", "is", null);
      if (error) return 0;
      return count ?? 0;
    },
  };
}
