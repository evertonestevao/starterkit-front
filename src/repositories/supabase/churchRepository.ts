import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchEvent, ChurchScheduleItem, PublicChurch } from "@/types/database";
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
  "id, parent_id, name, slug, logo_url, address, service_times, social_links, path, template_mode, template_id, public_code, pix_chave, pix_titular, created_at, updated_at";

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

    /**
     * Tema escolhido pela igreja (ou herdado da sede). Null = padrão. A RPC
     * resolve a herança; a tabela de templates dá o slug.
     */
    async resolveTemplateSlug(churchId: string): Promise<string | null> {
      const { data: templateId, error } = await client.rpc("resolve_template", {
        p_church_id: churchId,
      });
      if (error || !templateId) return null;
      const { data } = await client
        .from("templates")
        .select("slug")
        .eq("id", templateId as string)
        .maybeSingle<{ slug: string }>();
      return data?.slug ?? null;
    },

    listSchedule(churchId: string): Promise<ChurchScheduleItem[]> {
      return listPublicSchedule(client, churchId);
    },

    /** Próximos eventos (a partir de agora), do mais perto para o mais longe. */
    async listUpcomingEvents(churchId: string, limit = 50): Promise<ChurchEvent[]> {
      const { data, error } = await client
        .from("church_events")
        .select(EVENT_COLUMNS)
        .eq("church_id", churchId)
        .gte("inicio", new Date().toISOString())
        .order("inicio", { ascending: true })
        .limit(limit);
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar os eventos", error);
      }
      return (data ?? []) as ChurchEvent[];
    },

    /** Um evento, só se for DESTA igreja: id de outra igreja no link não abre nada. */
    async findEvent(churchId: string, eventId: string): Promise<ChurchEvent | null> {
      const { data, error } = await client
        .from("church_events")
        .select(EVENT_COLUMNS)
        .eq("church_id", churchId)
        .eq("id", eventId)
        .maybeSingle<ChurchEvent>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar o evento", error);
      }
      return data;
    },
  };
}

/** A programação publicada (cultos semanais e especiais). */
export async function listPublicSchedule(
  client: SupabaseClient,
  churchId: string,
): Promise<ChurchScheduleItem[]> {
  const { data, error } = await client
    .from("church_schedule")
    .select("id, church_id, titulo, tipo, dia_semana, data, hora, descricao, local")
    .eq("church_id", churchId)
    .order("hora");
  if (error) throw new AppError("internal_error", "Falha ao carregar a programação", error);
  return (data ?? []) as ChurchScheduleItem[];
}

const EVENT_COLUMNS =
  "id, church_id, titulo, descricao, inicio, fim, local, preco_cents, inscricoes_abertas";
