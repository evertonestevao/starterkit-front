import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  CampaignDonationRow,
  CampaignMethod,
  CampaignsRepository,
  CampaignStatus,
  CompanyCampaign,
} from "@/services/campaignsService";

/**
 * Campanhas do lado da igreja, com o client do usuário: a RLS já só deixa
 * gravar quem administra a igreja. O filtro por company_id é repetido aqui
 * (regra do projeto), e o nome da igreja é resolvido à parte — não existe
 * RPC de listagem com join, igual já acontece em church_receiving.
 */

const CAMPAIGN_COLUMNS =
  "id, church_id, titulo, foto_capa_url, historia, meta_cents, total_arrecadado_liquido_cents, metodo_recebimento, mostrar_progresso, valores_sugeridos, valor_padrao_cents, permitir_valor_livre, status, feedback_texto, feedback_foto_url, encerrada_at, created_at";

interface CampaignRow {
  id: string;
  church_id: string;
  titulo: string;
  foto_capa_url: string | null;
  historia: string;
  meta_cents: number;
  total_arrecadado_liquido_cents: number;
  metodo_recebimento: CampaignMethod;
  mostrar_progresso: boolean;
  valores_sugeridos: number[];
  valor_padrao_cents: number | null;
  permitir_valor_livre: boolean;
  status: CampaignStatus;
  feedback_texto: string | null;
  feedback_foto_url: string | null;
  encerrada_at: string | null;
  created_at: string;
}

function toCampaign(row: CampaignRow, churchName: string): CompanyCampaign {
  return {
    id: row.id,
    churchId: row.church_id,
    churchName,
    titulo: row.titulo,
    fotoCapaUrl: row.foto_capa_url,
    historia: row.historia,
    metaCents: row.meta_cents,
    totalArrecadadoLiquidoCents: row.total_arrecadado_liquido_cents,
    metodoRecebimento: row.metodo_recebimento,
    mostrarProgresso: row.mostrar_progresso,
    valoresSugeridos: row.valores_sugeridos,
    valorPadraoCents: row.valor_padrao_cents,
    permitirValorLivre: row.permitir_valor_livre,
    status: row.status,
    feedbackTexto: row.feedback_texto,
    feedbackFotoUrl: row.feedback_foto_url,
    encerradaAt: row.encerrada_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseCampaignsRepository(client: SupabaseClient): CampaignsRepository {
  async function churchNames(companyId: string): Promise<Map<string, string>> {
    const { data, error } = await client
      .from("churches")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
    return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
  }

  return {
    async listCompanyChurches(companyId) {
      const nomes = await churchNames(companyId);
      return [...nomes.entries()].map(([id, name]) => ({ id, name }));
    },

    async isCardReceivingApproved(companyId, churchId) {
      const { data, error } = await client
        .from("church_payment_accounts")
        .select("status")
        .eq("company_id", companyId)
        .eq("church_id", churchId)
        .maybeSingle<{ status: string }>();
      if (error) throw new AppError("internal_error", "Falha ao conferir o recebimento por cartão", error);
      return data?.status === "aprovada";
    },

    async listCampaigns(companyId) {
      const nomes = await churchNames(companyId);
      const { data, error } = await client
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new AppError("internal_error", "Falha ao carregar as campanhas", error);
      return ((data ?? []) as CampaignRow[]).map((row) => toCampaign(row, nomes.get(row.church_id) ?? ""));
    },

    async findCampaign(companyId, campaignId) {
      const nomes = await churchNames(companyId);
      const { data, error } = await client
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("company_id", companyId)
        .eq("id", campaignId)
        .is("deleted_at", null)
        .maybeSingle<CampaignRow>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a campanha", error);
      return data ? toCampaign(data, nomes.get(data.church_id) ?? "") : null;
    },

    async insertCampaign(input) {
      const { data, error } = await client
        .from("campaigns")
        .insert({
          church_id: input.churchId,
          titulo: input.titulo,
          historia: input.historia,
          meta_cents: input.metaCents,
          metodo_recebimento: input.metodoRecebimento,
          mostrar_progresso: input.mostrarProgresso,
          permitir_valor_livre: input.permitirValorLivre,
          valores_sugeridos: input.valoresSugeridos,
          valor_padrao_cents: input.valorPadraoCents,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        if (error?.code === "42501") {
          throw new AppError("forbidden", "Só quem administra a igreja pode criar campanhas.", error);
        }
        throw new AppError("internal_error", "Não foi possível criar a campanha.", error);
      }
      return data.id;
    },

    async updateCampaign(companyId, campaignId, input) {
      const { data, error } = await client
        .from("campaigns")
        .update({
          titulo: input.titulo,
          historia: input.historia,
          meta_cents: input.metaCents,
          metodo_recebimento: input.metodoRecebimento,
          mostrar_progresso: input.mostrarProgresso,
          permitir_valor_livre: input.permitirValorLivre,
          valores_sugeridos: input.valoresSugeridos,
          valor_padrao_cents: input.valorPadraoCents,
        })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao editar a campanha", error);
      return (data ?? []).length > 0;
    },

    async setStatus(companyId, campaignId, status, encerradaAt) {
      const { data, error } = await client
        .from("campaigns")
        .update({ status, encerrada_at: encerradaAt })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao mudar o status da campanha", error);
      return (data ?? []).length > 0;
    },

    async setFeedback(companyId, campaignId, feedbackTexto) {
      const { data, error } = await client
        .from("campaigns")
        .update({ feedback_texto: feedbackTexto })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao salvar a devolutiva", error);
      return (data ?? []).length > 0;
    },

    async setCoverUrl(companyId, campaignId, url) {
      const { data, error } = await client
        .from("campaigns")
        .update({ foto_capa_url: url })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao salvar a capa", error);
      return (data ?? []).length > 0;
    },

    async setFeedbackFotoUrl(companyId, campaignId, url) {
      const { data, error } = await client
        .from("campaigns")
        .update({ feedback_foto_url: url })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao salvar a foto da devolutiva", error);
      return (data ?? []).length > 0;
    },

    async softDeleteCampaign(companyId, campaignId) {
      const { data, error } = await client
        .from("campaigns")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", campaignId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao remover a campanha", error);
      return (data ?? []).length > 0;
    },

    async listDonations(companyId, campaignId) {
      const { data, error } = await client
        .from("campaign_donations")
        .select(
          "id, doador_nome, doador_telefone, valor_bruto_cents, valor_liquido_cents, taxa_cents, metodo, status, created_at, confirmada_em",
        )
        .eq("campaign_id", campaignId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new AppError("internal_error", "Falha ao carregar as doações", error);
      return (
        (data ?? []) as Array<{
          id: string;
          doador_nome: string;
          doador_telefone: string | null;
          valor_bruto_cents: number;
          valor_liquido_cents: number | null;
          taxa_cents: number | null;
          metodo: CampaignMethod;
          status: "pendente" | "confirmada" | "recusada";
          created_at: string;
          confirmada_em: string | null;
        }>
      ).map(
        (row): CampaignDonationRow => ({
          id: row.id,
          doadorNome: row.doador_nome,
          doadorTelefone: row.doador_telefone,
          valorBrutoCents: row.valor_bruto_cents,
          valorLiquidoCents: row.valor_liquido_cents,
          taxaCents: row.taxa_cents,
          metodo: row.metodo,
          status: row.status,
          createdAt: row.created_at,
          confirmadaEm: row.confirmada_em,
        }),
      );
    },

    async confirmPixDonation(donationId) {
      const { error } = await client.rpc("confirmar_doacao_pix", { p_donation_id: donationId });
      if (error) {
        if (error.code === "42501") {
          throw new AppError("forbidden", "Sem permissão para confirmar esta doação.", error);
        }
        throw new AppError("internal_error", "Falha ao confirmar a doação.", error);
      }
    },
  };
}
