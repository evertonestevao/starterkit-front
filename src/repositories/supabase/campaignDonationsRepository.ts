import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CampaignDonationsRepository } from "@/services/campaignDonationsService";

/**
 * Doação pública numa campanha.
 *
 * Dois clients, mesmo motivo de church_receiving: o do usuário (aqui,
 * anônimo) cria a doação pelas RPCs de segurança e lê o que já é público
 * (campanha, chave PIX); o de SERVICE_ROLE lê a chave de API cifrada da
 * subconta, coluna que nem `authenticated` alcança.
 */
export function createSupabaseCampaignDonationsRepository(
  client: SupabaseClient,
  adminClient: SupabaseClient,
): CampaignDonationsRepository {
  return {
    async findChurchForCampaign(campaignId) {
      const { data: campanha, error: erroCampanha } = await client
        .from("campaigns")
        .select("church_id")
        .eq("id", campaignId)
        .maybeSingle<{ church_id: string }>();
      if (erroCampanha) {
        throw new AppError("internal_error", "Falha ao carregar a campanha", erroCampanha);
      }
      if (!campanha) return null;

      const { data: igreja, error: erroIgreja } = await client
        .from("churches")
        .select("id, name, pix_chave, pix_titular, address")
        .eq("id", campanha.church_id)
        .maybeSingle<{
          id: string;
          name: string;
          pix_chave: string | null;
          pix_titular: string | null;
          address: string | null;
        }>();
      if (erroIgreja) {
        throw new AppError("internal_error", "Falha ao carregar a igreja", erroIgreja);
      }
      if (!igreja) return null;

      return {
        churchId: igreja.id,
        churchName: igreja.name,
        pixChave: igreja.pix_chave,
        pixTitular: igreja.pix_titular,
        endereco: igreja.address,
      };
    },

    async createPixDonation({ campaignId, nome, telefone, valorCents }) {
      const { data, error } = await adminClient.rpc("criar_doacao_pix_campanha", {
        p_campaign_id: campaignId,
        p_nome: nome,
        p_telefone: telefone,
        p_valor_cents: valorCents,
      });
      if (error) {
        // A função do banco escreve as recusas para quem doa ler ("informe
        // seu nome", "campanha não está recebendo"); o resto vira genérico.
        if (error.code === "P0001") throw new AppError("validation_error", error.message, error);
        if (error.code === "P0002") throw new AppError("not_found", "Campanha não encontrada.", error);
        throw new AppError("internal_error", "Não foi possível registrar a doação.", error);
      }
      return data as string;
    },

    async createGatewayDonation({ campaignId, nome, telefone, valorCents }) {
      const { data, error } = await adminClient.rpc("registrar_doacao_gateway_campanha", {
        p_campaign_id: campaignId,
        p_nome: nome,
        p_telefone: telefone,
        p_valor_cents: valorCents,
      });
      if (error) {
        if (error.code === "P0001") throw new AppError("validation_error", error.message, error);
        if (error.code === "P0002") throw new AppError("not_found", "Campanha não encontrada.", error);
        throw new AppError("internal_error", "Não foi possível registrar a doação.", error);
      }
      return data as string;
    },

    async getSealedApiKeyIfCardEnabled(churchId) {
      const { data, error } = await adminClient
        .from("church_payment_accounts")
        .select("status, api_key_cifrada, provider")
        .eq("church_id", churchId)
        .maybeSingle<{ status: string; api_key_cifrada: string | null; provider: string | null }>();
      if (error) {
        throw new AppError("internal_error", "Falha ao conferir o recebimento por cartão", error);
      }
      if (!data || data.status !== "aprovada" || !data.api_key_cifrada || !data.provider) return null;
      return { apiKeyCifrada: data.api_key_cifrada, provider: data.provider };
    },
  };
}

/** Lado do webhook: sem sessão de usuário, tudo com service_role. */
export function createSupabaseCampaignDonationStore(adminClient: SupabaseClient) {
  return {
    /**
     * Aplica a confirmação de uma doação por cartão. Idempotente (a UPDATE só
     * pega linha 'pendente'): uma reentrega do mesmo webhook não soma duas
     * vezes. Só soma o total quando o pagamento foi recebido de verdade —
     * pendente/estornado não mexem no progresso da campanha.
     */
    async applyGatewayConfirmation(
      donationId: string,
      donation: { status: "pendente" | "recebida" | "estornada" | "cancelada"; amountCents: number; netAmountCents: number | null },
    ): Promise<"applied" | "ignored" | "stale"> {
      if (donation.status !== "recebida") return "ignored";

      const valorLiquido = donation.netAmountCents ?? donation.amountCents;
      const taxa = donation.netAmountCents !== null ? donation.amountCents - donation.netAmountCents : null;

      const { data, error } = await adminClient
        .from("campaign_donations")
        .update({
          status: "confirmada",
          valor_liquido_cents: valorLiquido,
          taxa_cents: taxa,
          confirmada_em: new Date().toISOString(),
        })
        .eq("id", donationId)
        .eq("status", "pendente")
        .select("campaign_id");
      if (error) {
        throw new AppError("internal_error", "Falha ao confirmar a doação por cartão", error);
      }
      if (!data || data.length === 0) return "stale";

      const campaignId = data[0].campaign_id as string;
      const { error: incrementoErro } = await adminClient.rpc("incrementar_total_campanha", {
        p_campaign_id: campaignId,
        p_valor_cents: valorLiquido,
      });
      if (incrementoErro) {
        throw new AppError("internal_error", "Falha ao somar o total da campanha", incrementoErro);
      }
      return "applied";
    },
  };
}
