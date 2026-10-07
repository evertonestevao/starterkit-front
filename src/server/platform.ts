import { cache } from "react";
import { notFound } from "next/navigation";
import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createSupabaseChurchHierarchyRepository } from "@/repositories/supabase/churchHierarchyRepository";
import { createSupabasePlatformModerationRepository } from "@/repositories/supabase/platformModerationRepository";
import { createSupabasePlatformPricingRepository } from "@/repositories/supabase/platformPricingRepository";
import { createSupabasePlatformSettingsRepository } from "@/repositories/supabase/platformSettingsRepository";
import { createChurchHierarchyService, type ChurchHierarchyService } from "@/services/churchHierarchyService";
import { createEmailService } from "@/services/emailService";
import { createPlatformPricingService, type PlatformPricingService } from "@/services/platformPricingService";
import { createPlatformSettingsService, type PlatformSettingsService } from "@/services/platformSettingsService";
import { createPlatformModerationService, type PlatformModerationService } from "@/services/platformModerationService";
import { createSupabaseMensalidadeRepository } from "@/repositories/supabase/mensalidadeRepository";
import { createMensalidadeService, type MensalidadeService } from "@/services/mensalidadeService";
import { hojeISO } from "@/lib/acompanhamento";
import { createSupabasePlatformTermsRepository } from "@/repositories/supabase/platformTermsRepository";
import { createPlatformTermsService, type PlatformTermsService } from "@/services/platformTermsService";
import { getSponsorSystemService } from "./sponsor";
import { getSupabaseAdminClient } from "./supabase-admin";
import { SPONSOR_LOGOS_BUCKET } from "./sponsorProfile";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Área da plataforma (moderação).
 *
 * `is_platform_staff()` é a fonte da verdade e é checada DE NOVO dentro de
 * cada RPC — a checagem daqui serve para a UI não oferecer o que não pode, e
 * não como barreira. A barreira está no banco.
 */
export const isPlatformStaff = cache(async (): Promise<boolean> => {
  const client = await getSupabaseServerClient();
  const { data, error } = await client.rpc("is_platform_staff");
  if (error) return false;
  return Boolean(data);
});

/**
 * Guarda das TELAS da moderação: quem não é da moderação recebe "não
 * encontrado". O layout já faz isso, mas layout e página são renderizados em
 * paralelo — sem a guarda também na página, ela chega a pedir os dados, o
 * banco nega e o log registra um erro a cada visita de curioso em /plataforma.
 * (`isPlatformStaff` é uma consulta só por request, para as duas chamadas.)
 */
export async function exigePlatformStaff(): Promise<void> {
  if (!(await isPlatformStaff())) notFound();
}

/** Usada nas server actions: falha fechada. */
export async function requirePlatformStaff(): Promise<void> {
  if (!(await isPlatformStaff())) {
    throw new AppError("forbidden", "Esta área é da moderação da plataforma.");
  }
}

export async function getPlatformModerationService(): Promise<PlatformModerationService> {
  const env = getServerEnv();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: env.APP_URL });
  const client = await getSupabaseServerClient();

  // Publicar é mover de `pendente/` para `publico/`, e só service_role
  // escreve na pasta pública: é isso que impede subir direto para lá e pular
  // a fila. A URL final sai do storage, não do banco.
  const logos = createSupabaseStorageProvider(getSupabaseAdminClient(), SPONSOR_LOGOS_BUCKET);

  return createPlatformModerationService({
    repo: createSupabasePlatformModerationRepository(client, getSupabaseAdminClient()),
    notifier: {
      sendProfileDecision: (input) => email.sendSponsorProfileDecision(input),
      sendHoldReleased: (input) => email.sendSponsorHoldReleased(input),
    },
    async publishLogo({ pendingPath, sponsorAccountId }) {
      const nome = pendingPath.split("/").pop() ?? `${sponsorAccountId}.png`;
      const destino = `publico/${sponsorAccountId}/${nome}`;
      await logos.move(pendingPath, destino);
      return logos.getPublicUrl(destino);
    },
  });
}

/**
 * URL do arquivo que ainda está na pasta pendente, para a moderação ver o que
 * está decidindo. Só a moderação chega nesta página; o arquivo é o que a
 * própria pessoa enviou.
 */
export function getPendingLogoUrl(pendingPath: string): string {
  return createSupabaseStorageProvider(getSupabaseAdminClient(), SPONSOR_LOGOS_BUCKET).getPublicUrl(pendingPath);
}

/** Árvore Sede > Subsede > Congregação (só a plataforma liga uma igreja a outra). */
export async function getChurchHierarchyService(): Promise<ChurchHierarchyService> {
  const client = await getSupabaseServerClient();
  return createChurchHierarchyService(createSupabaseChurchHierarchyRepository(client));
}

/** Configurações da plataforma (vagas de primeiro patrocínio e carência da marca). */
export async function getPlatformSettingsService(): Promise<PlatformSettingsService> {
  const client = await getSupabaseServerClient();
  return createPlatformSettingsService(createSupabasePlatformSettingsRepository(client));
}

/**
 * Mensalidade por igreja (valor próprio definido pela moderação). Mudou o
 * valor de uma igreja que já paga: o `SponsorService` de sistema atualiza a
 * cobrança no provedor.
 */
export async function getMensalidadeService(): Promise<MensalidadeService> {
  const client = await getSupabaseServerClient();
  return createMensalidadeService({
    repo: createSupabaseMensalidadeRepository(client),
    biller: getSponsorSystemService(),
  });
}

/** Termos de Uso: a moderação publica versões novas. */
export async function getPlatformTermsService(): Promise<PlatformTermsService> {
  const client = await getSupabaseServerClient();
  return createPlatformTermsService({ repo: createSupabasePlatformTermsRepository(client), hoje: hojeISO });
}

/** Tabela de preço do patrocínio, por posição. */
export async function getPlatformPricingService(): Promise<PlatformPricingService> {
  const client = await getSupabaseServerClient();
  return createPlatformPricingService(createSupabasePlatformPricingRepository(client));
}
