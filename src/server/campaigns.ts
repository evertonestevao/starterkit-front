import "server-only";
import { getReceivingProvider } from "@/adapters/payment";
import { requireServerEnv } from "@/config/env";
import { openSecret } from "@/lib/secretBox";
import { createSupabaseCampaignDonationsRepository } from "@/repositories/supabase/campaignDonationsRepository";
import { createSupabaseCampaignsRepository } from "@/repositories/supabase/campaignsRepository";
import {
  createCampaignDonationsService,
  type CampaignDonationsService,
} from "@/services/campaignDonationsService";
import { createCampaignsService, type CampaignsService } from "@/services/campaignsService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/** Bucket de capa e foto de devolutiva da campanha (público para leitura). */
export const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

/** Campanhas do painel da igreja, com o client do usuário (RLS valendo). */
export async function getCampaignsService(): Promise<CampaignsService> {
  return createCampaignsService(createSupabaseCampaignsRepository(await getSupabaseServerClient()));
}

/** Doação pública numa campanha (formulário sem login). */
export async function getCampaignDonationsService(): Promise<CampaignDonationsService> {
  const client = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  return createCampaignDonationsService({
    repo: createSupabaseCampaignDonationsRepository(client, admin),
    resolveProvider: (providerName) => getReceivingProvider(providerName),
    secrets: { open: (sealed) => openSecret(sealed, requireServerEnv("RECEIVING_KEY_SECRET")) },
  });
}
