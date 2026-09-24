import { publicCampaignDonationSchema } from "@/features/campaigns/schemas";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError, toValidationError } from "@/lib/errors";
import { buildPixPayload } from "@/lib/pixPayload";
import { qrPngDataUrl } from "@/lib/qr";

/**
 * Doação pública numa campanha: quem visita a página escolhe o valor e a
 * forma de pagamento. PIX gera o "copia e cola" com o valor já embutido;
 * cartão cria a cobrança na subconta da igreja e devolve para onde
 * redirecionar quem está doando.
 *
 * As duas validações de negócio que moram aqui (e não na RPC, que já confere
 * de novo): telefone é obrigatório no PIX — é por ele que a igreja confere o
 * comprovante —, e cartão só funciona com a subconta aprovada.
 */

export interface CampaignChurchInfo {
  churchId: string;
  churchName: string;
  pixChave: string | null;
  pixTitular: string | null;
  endereco: string | null;
}

export interface CampaignDonationsRepository {
  findChurchForCampaign(campaignId: string): Promise<CampaignChurchInfo | null>;
  createPixDonation(input: {
    campaignId: string;
    nome: string;
    telefone: string;
    valorCents: number;
  }): Promise<string>;
  createGatewayDonation(input: {
    campaignId: string;
    nome: string;
    telefone: string | null;
    valorCents: number;
  }): Promise<string>;
  /** Chave de API da subconta (cifrada) e o provedor dela, só se aprovada. */
  getSealedApiKeyIfCardEnabled(
    churchId: string,
  ): Promise<{ apiKeyCifrada: string; provider: string } | null>;
}

export interface CampaignDonationChargeProvider {
  createDonationCharge(input: {
    apiKey: string;
    amountCents: number;
    externalReference: string;
    description: string;
    payer?: { name: string; phone?: string };
  }): Promise<{ checkoutUrl: string; externalId: string }>;
}

export interface CampaignDonationSecrets {
  open(sealed: string): string;
}

function parseValor(texto: string): number {
  const cents = parseBrlToCents(texto);
  if (cents === null || cents <= 0) {
    throw new AppError("validation_error", "Informe um valor válido para a doação.");
  }
  return cents;
}

export function createCampaignDonationsService(deps: {
  repo: CampaignDonationsRepository;
  /** Mesma regra do recebimento geral: o provedor é o gravado NA CONTA, não um padrão fixo. */
  resolveProvider: (providerName: string) => CampaignDonationChargeProvider;
  secrets: CampaignDonationSecrets;
}) {
  return {
    /** PIX direto: gera o "copia e cola" já com o valor da doação embutido. */
    async submitPixDonation(input: unknown): Promise<{
      donationId: string;
      pixChave: string;
      pixCopiaECola: string;
      pixQrDataUrl: string;
    }> {
      const parsed = publicCampaignDonationSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      if (dados.telefone.trim().length < 8) {
        throw new AppError("validation_error", "Informe um telefone para contato.");
      }
      const valorCents = parseValor(dados.valor);

      const igreja = await deps.repo.findChurchForCampaign(dados.campaignId);
      if (!igreja) throw new AppError("not_found", "Campanha não encontrada.");
      if (!igreja.pixChave) {
        throw new AppError("internal_error", "Esta igreja ainda não cadastrou a chave PIX.");
      }

      const donationId = await deps.repo.createPixDonation({
        campaignId: dados.campaignId,
        nome: dados.nome,
        telefone: dados.telefone,
        valorCents,
      });

      const pixCopiaECola = buildPixPayload({
        chave: igreja.pixChave,
        titular: igreja.pixTitular ?? igreja.churchName,
        cidade: igreja.endereco?.split(/[-,]/).at(-1)?.trim(),
        valorCents,
        txid: donationId,
      });
      const pixQrDataUrl = await qrPngDataUrl(pixCopiaECola, 512);

      return { donationId, pixChave: igreja.pixChave, pixCopiaECola, pixQrDataUrl };
    },

    /** Cartão: cria a cobrança na subconta da igreja e devolve o checkout. */
    async submitGatewayDonation(input: unknown): Promise<{ checkoutUrl: string }> {
      const parsed = publicCampaignDonationSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;
      const valorCents = parseValor(dados.valor);

      const igreja = await deps.repo.findChurchForCampaign(dados.campaignId);
      if (!igreja) throw new AppError("not_found", "Campanha não encontrada.");

      const conta = await deps.repo.getSealedApiKeyIfCardEnabled(igreja.churchId);
      if (!conta) {
        throw new AppError(
          "internal_error",
          "Esta campanha não está pronta para receber por cartão no momento. Tente de novo mais tarde.",
        );
      }

      const donationId = await deps.repo.createGatewayDonation({
        campaignId: dados.campaignId,
        nome: dados.nome,
        telefone: dados.telefone.trim() || null,
        valorCents,
      });

      const { checkoutUrl } = await deps.resolveProvider(conta.provider).createDonationCharge({
        apiKey: deps.secrets.open(conta.apiKeyCifrada),
        amountCents: valorCents,
        externalReference: `campaign:${donationId}`,
        description: `Doação — ${igreja.churchName}`,
        payer: { name: dados.nome, phone: dados.telefone.trim() || undefined },
      });

      return { checkoutUrl };
    },
  };
}

export type CampaignDonationsService = ReturnType<typeof createCampaignDonationsService>;
