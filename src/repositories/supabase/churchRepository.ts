import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SponsorLinkKind } from "@/lib/sponsorLink";
import type { Campaign, ChurchEvent, ChurchScheduleItem, PublicChurch } from "@/types/database";
import type { PublicSponsor } from "@/types/sponsorship";
import type { IgrejaDaRedePublica } from "@/types/redePublica";

/**
 * Leitura pública de igreja.
 *
 * As colunas são listadas explicitamente porque `anon` recebe GRANT de SELECT
 * por COLUNA (ver migration do domínio próprio): status de domínio e a flag de
 * suporte pago são informação interna, e `select *` passaria a falhar com
 * permission denied — que é exatamente o comportamento desejado.
 */

export function createSupabasePublicChurchRepository(client: SupabaseClient) {
  return {
    /**
     * Endereço antigo (/igreja/{codigo} de uma igreja que hoje está numa
     * rede): a chave atual, quando o código aponta para uma igreja só.
     */
    async findChaveByCodigoAntigo(codigo: string): Promise<string | null> {
      const { data, error } = await client.rpc("chave_publica_por_codigo", { p_codigo: codigo });
      if (error) throw new AppError("internal_error", "Falha ao procurar a igreja", error);
      return typeof data === "string" && data !== "" ? data : null;
    },

    /**
     * A igreja da página pública, pela chave. Sai de uma função do banco
     * (`igreja_publica`), não da tabela: usuário logado só lê igreja da
     * própria rede, e a página de qualquer igreja precisa abrir para todos.
     * A função devolve a linha se a página está no ar; fora do ar, só para
     * quem administra a igreja (`previa`).
     */
    async findByPublicCode(publicCode: string): Promise<(PublicChurch & { previa: boolean }) | null> {
      const { data, error } = await client.rpc("igreja_publica", { p_chave: publicCode });
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      }
      const linha = ((data ?? []) as Array<PublicChurch & { previa: boolean; tem_dono: boolean }>)[0];
      if (!linha) return null;
      const { tem_dono: _temDono, ...igreja } = linha;
      void _temDono;

      // A chave Pix só vem confirmada pelo Responsável (ou aprovada pela moderação), e com a página no ar.
      const { data: pix, error: erroPix } = await client.rpc("pix_publico", { p_church_id: igreja.id });
      if (erroPix) throw new AppError("internal_error", "Falha ao carregar a igreja", erroPix);
      const aprovado = ((pix ?? []) as Array<{ chave: string; titular: string | null }>)[0];
      return { ...igreja, pix_chave: aprovado?.chave ?? null, pix_titular: aprovado?.titular ?? null };
    },

    /** Vitrine: nome, logo e destino de quem patrocina agora (RPC security definer). */
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
        link_tipo: SponsorLinkKind | null;
        link_valor: string | null;
      }>).map((row) => ({
        id: row.sponsorship_id,
        name: row.display_name,
        logo_url: row.logo_url,
        link_tipo: row.link_tipo,
        link_valor: row.link_valor,
      }));
    },

    /**
     * Tema e cor de destaque da igreja (ou herdados da mãe). Nulos = padrão.
     * A RPC resolve a herança dos dois juntos; a tabela de templates dá o slug.
     */
    async resolveAppearance(
      churchId: string,
    ): Promise<{ slug: string | null; accent: string | null }> {
      const semTema = { slug: null, accent: null };
      const { data: linhas, error } = await client.rpc("resolve_church_appearance", {
        p_church_id: churchId,
      });
      const resolvida = ((linhas ?? []) as Array<{ template_id: string; accent_color: string | null }>)[0];
      if (error || !resolvida) return semTema;
      const { data } = await client
        .from("templates")
        .select("slug")
        .eq("id", resolvida.template_id)
        .maybeSingle<{ slug: string }>();
      return { slug: data?.slug ?? null, accent: resolvida.accent_color };
    },

    /**
      * Link de doação por cartão, quando a igreja tem conta aprovada e ligou o
      * cartão. A RPC devolve só isso: a subconta tem documento e segredos que
      * a página pública não pode nem cheirar.
      */
    async getCardDonationLink(churchId: string): Promise<string | null> {
      const { data, error } = await client.rpc("church_card_donation_link", {
        p_church_id: churchId,
      });
      if (error) {
        console.error("[church-page] falha ao carregar o link de cartão", error);
        return null;
      }
      return (data as string | null) ?? null;
    },

    /** Mesma ideia, para o Pix pela subconta Asaas (quando a igreja escolheu essa fonte). */
    async getPixDonationLink(churchId: string): Promise<string | null> {
      const { data, error } = await client.rpc("church_pix_donation_link", {
        p_church_id: churchId,
      });
      if (error) {
        console.error("[church-page] falha ao carregar o link de pix", error);
        return null;
      }
      return (data as string | null) ?? null;
    },

    listSchedule(churchId: string): Promise<ChurchScheduleItem[]> {
      return listPublicSchedule(client, churchId);
    },

    /**
     * As igrejas ligadas a uma igreja do topo (função do banco, migration
     * 20261006160000). Para uma igreja que não é do topo, volta vazia.
     */
    /** Tem alguma igreja ligada direto a esta? (para mostrar o atalho "Nossas igrejas") */
    async hasChildChurches(churchId: string): Promise<boolean> {
      const { data, error } = await client.rpc("rede_tem_igrejas", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar a rede da igreja", error);
      return data === true;
    },

    async listNetworkChurches(churchId: string): Promise<IgrejaDaRedePublica[]> {
      const { data, error } = await client.rpc("rede_igrejas_publicas", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas da rede", error);
      return (data ?? []) as IgrejaDaRedePublica[];
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

    /** Campanhas visíveis ao público (ativa ou encerrada), mais recente primeiro. */
    async listActiveCampaigns(churchId: string): Promise<Campaign[]> {
      const { data, error } = await client
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("church_id", churchId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar as campanhas", error);
      }
      return (data ?? []) as Campaign[];
    },

    /** Uma campanha, só se for DESTA igreja e estiver visível ao público. */
    async findCampaign(churchId: string, campaignId: string): Promise<Campaign | null> {
      const { data, error } = await client
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("church_id", churchId)
        .eq("id", campaignId)
        .maybeSingle<Campaign>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a campanha", error);
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

const CAMPAIGN_COLUMNS =
  "id, church_id, titulo, foto_capa_url, historia, meta_cents, total_arrecadado_liquido_cents, metodo_recebimento, mostrar_progresso, valores_sugeridos, valor_padrao_cents, permitir_valor_livre, status, feedback_texto, feedback_foto_url, encerrada_at, created_at";
