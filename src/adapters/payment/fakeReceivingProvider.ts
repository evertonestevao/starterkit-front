import { AppError } from "@/lib/errors";
import type {
  DonationWebhookEvent,
  ReceivingAccount,
  ReceivingProvider,
} from "./ReceivingProvider";

/**
 * Provedor de recebimento de mentira, para desenvolvimento e testes.
 *
 * Aprova a subconta na hora — em produção isso leva de horas a dias, e é
 * justamente por isso que a tela tem estado "em análise": quem só testar com
 * o fake nunca veria essa espera. O webhook aceita o token gravado para a
 * igreja, do mesmo jeito que o de verdade.
 */
export function createFakeReceivingProvider(): ReceivingProvider {
  return {
    name: "fake",

    async createAccount(input): Promise<ReceivingAccount> {
      return {
        accountId: `fake_acc_${input.documento}`,
        walletId: `fake_wallet_${input.documento}`,
        apiKey: `fake_key_${input.documento}`,
        status: "aprovada",
      };
    },

    async getAccountStatus() {
      return "aprovada";
    },

    async ensureDonationLink({ churchName }) {
      return {
        url: `https://pagamento.exemplo/doar/${encodeURIComponent(churchName)}`,
      };
    },

    async createDonationCharge({ amountCents, externalReference }) {
      return {
        checkoutUrl: `https://pagamento.exemplo/cobranca/${encodeURIComponent(externalReference)}?valor=${amountCents}`,
        externalId: `fake_pay_${externalReference}`,
      };
    },

    readAccountReference(rawBody) {
      try {
        return (JSON.parse(rawBody) as { accountReference?: string }).accountReference ?? null;
      } catch {
        return null;
      }
    },

    async parseWebhook({ rawBody, headers, verifyToken }): Promise<DonationWebhookEvent> {
      if (!verifyToken(headers.get("x-webhook-token") ?? "")) {
        throw new AppError("unauthorized", "Webhook não autenticado");
      }

      let payload: {
        event?: string;
        paymentId?: string;
        amountCents?: number;
        netAmountCents?: number;
        metodo?: "cartao" | "pix" | "boleto" | "outro";
        status?: "pendente" | "recebida" | "estornada" | "cancelada";
        pagaEm?: string | null;
        externalReference?: string | null;
      };
      try {
        payload = JSON.parse(rawBody) as typeof payload;
      } catch {
        throw new AppError("validation_error", "Webhook com corpo inválido");
      }

      if (!payload.paymentId || typeof payload.amountCents !== "number") {
        return { kind: "ignored", provider: "fake" };
      }

      return {
        kind: "donation",
        provider: "fake",
        donation: {
          externalPaymentId: payload.paymentId,
          amountCents: payload.amountCents,
          metodo: payload.metodo ?? "cartao",
          status: payload.status ?? "recebida",
          pagaEm: payload.pagaEm ?? new Date().toISOString(),
          externalReference: payload.externalReference ?? null,
          netAmountCents: typeof payload.netAmountCents === "number" ? payload.netAmountCents : null,
        },
      };
    },
  };
}
