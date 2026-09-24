import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDefaultReceivingProviderName, getReceivingProvider } from "@/adapters/payment";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { openSecret, sealSecret } from "@/lib/secretBox";
import { secretsMatch } from "@/lib/secrets";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseCampaignDonationStore } from "@/repositories/supabase/campaignDonationsRepository";
import {
  createSupabaseChurchReceivingRepository,
  createSupabaseDonationsReader,
  createSupabaseDonationStore,
} from "@/repositories/supabase/churchReceivingRepository";
import { createAuditService } from "@/services/auditService";
import {
  createChurchReceivingService,
  createDonationWebhookService,
  type ChurchReceivingService,
  type ReceivingSecrets,
} from "@/services/churchReceivingService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Recebimento por cartão da igreja (subconta no provedor).
 *
 * Os segredos vivem aqui: a chave da subconta é cifrada antes de ir ao banco,
 * e o token do webhook de cada igreja é gerado aqui, entregue ao provedor e
 * guardado só como hash.
 */
function buildSecrets(): ReceivingSecrets {
  const secret = requireServerEnv("RECEIVING_KEY_SECRET");
  return {
    seal: (plaintext) => sealSecret(plaintext, secret),
    open: (sealed) => openSecret(sealed, secret),
    newWebhookToken() {
      // 32 bytes: o token é a única prova de que o evento veio da subconta
      // desta igreja.
      const token = randomBytes(32).toString("base64url");
      return { token, hash: hashToken(token) };
    },
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getChurchReceivingService(): Promise<ChurchReceivingService> {
  const client = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  return createChurchReceivingService({
    repo: createSupabaseChurchReceivingRepository(client, admin),
    provider: getReceivingProvider(getDefaultReceivingProviderName()),
    secrets: buildSecrets(),
    appUrl: getServerEnv().APP_URL,
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}

/** Doações recebidas, para o painel da igreja (RLS do usuário valendo). */
export async function getDonationsReader() {
  return createSupabaseDonationsReader(await getSupabaseServerClient());
}

/**
 * Lado do webhook: sem sessão. Acha a igreja pela subconta que mandou o
 * evento e confere o token DAQUELA igreja antes de aplicar qualquer coisa.
 */
/** Prefixo que marca uma doação de CAMPANHA na `externalReference` da cobrança. */
const REFERENCIA_CAMPANHA = "campaign:";

export function getDonationWebhookHandler(providerName: string) {
  const provider = getReceivingProvider(providerName);
  const store = createSupabaseDonationStore(getSupabaseAdminClient());
  const campaignStore = createSupabaseCampaignDonationStore(getSupabaseAdminClient());
  const service = createDonationWebhookService({ store });

  return {
    async handle(rawBody: string, headers: Headers) {
      const referencia = provider.readAccountReference(rawBody);
      if (!referencia) return { outcome: "ignored" as const };

      const conta = await store.findAccountByExternalId(provider.name, referencia);
      if (!conta) {
        // Evento de uma subconta que não é nossa: nada a fazer, e nada a
        // revelar sobre quais contas existem.
        return { outcome: "unknown_account" as const };
      }

      // O provedor manda o token em claro; o que guardamos é o hash dele.
      const event = await provider.parseWebhook({
        rawBody,
        headers,
        verifyToken: (provided) =>
          provided.length > 0 && secretsMatch(hashToken(provided), conta.webhookTokenHash),
      });

      // Mesma subconta, dois destinos possíveis: dízimo/oferta avulsa (sem
      // referência, cai no fluxo de sempre) ou doação de uma CAMPANHA — a
      // referência que a plataforma mandou ao criar a cobrança diz qual.
      const referenciaExterna = event.kind === "donation" ? event.donation?.externalReference : null;
      if (referenciaExterna?.startsWith(REFERENCIA_CAMPANHA)) {
        const donationId = referenciaExterna.slice(REFERENCIA_CAMPANHA.length);
        const donation = event.donation!;
        return {
          outcome: await campaignStore.applyGatewayConfirmation(donationId, {
            status: donation.status,
            amountCents: donation.amountCents,
            netAmountCents: donation.netAmountCents,
          }),
        };
      }

      return { outcome: await service.apply(event, conta.churchId) };
    },
  };
}

/** Falha cedo e com mensagem clara quando o ambiente não está preparado. */
export function assertReceivingConfigured(): void {
  if (!getServerEnv().RECEIVING_KEY_SECRET) {
    throw new AppError(
      "internal_error",
      "O recebimento por cartão não está configurado nesta instalação.",
    );
  }
}
