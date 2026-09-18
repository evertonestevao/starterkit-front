import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PublicChurch } from "@/types/database";
import type { PublicSponsor } from "@/types/sponsorship";

/**
 * Leitura pública de igreja.
 *
 * As colunas são listadas explicitamente porque `anon` recebe GRANT de SELECT
 * por COLUNA (ver migration do domínio próprio): status de domínio e a flag de
 * suporte pago são informação interna, e `select *` passaria a falhar com
 * permission denied — que é exatamente o comportamento desejado.
 */
export const PUBLIC_CHURCH_COLUMNS =
  "id, parent_id, name, slug, logo_url, address, service_times, social_links, path, template_mode, template_id, public_code, created_at, updated_at";

export function createSupabasePublicChurchRepository(client: SupabaseClient) {
  return {
    async findByPublicCode(publicCode: string): Promise<PublicChurch | null> {
      const { data, error } = await client
        .from("churches")
        .select(PUBLIC_CHURCH_COLUMNS)
        .eq("public_code", publicCode)
        // Igreja excluída fica fora pela policy `churches_public_select`, que
        // vale para qualquer consulta. Filtrar `deleted_at` aqui NÃO funciona:
        // o anon só tem SELECT em colunas específicas, e essa não é uma delas
        // — a consulta falharia com permission denied e derrubaria a página
        // de toda igreja. A policy enxerga a coluna; o client não precisa.
        .maybeSingle<PublicChurch>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      }
      return data;
    },

    /** Vitrine: só nome e logo de quem patrocina agora (RPC security definer). */
    async listPublicSponsors(churchId: string): Promise<PublicSponsor[]> {
      const { data, error } = await client.rpc("list_church_sponsors", {
        p_church_id: churchId,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar patrocinadores", error);
      }
      return ((data ?? []) as Array<{
        sponsorship_id: string;
        display_name: string;
        logo_url: string | null;
      }>).map((row) => ({
        id: row.sponsorship_id,
        name: row.display_name,
        logo_url: row.logo_url,
      }));
    },
  };
}
