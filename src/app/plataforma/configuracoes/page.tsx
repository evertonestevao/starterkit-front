import type { Metadata } from "next";
import { AutopatrocinioForm, PlatformSettingsForm } from "@/features/platform/components/platform-settings-form";
import { SponsorPricingForm } from "@/features/platform/components/sponsor-pricing-form";
import { exigePlatformStaff, getPlatformPricingService, getPlatformSettingsService } from "@/server/platform";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Configurações da plataforma. Só a moderação chega aqui (o layout barra), e
 * o banco confere de novo: as tabelas não têm policy de escrita nenhuma e as
 * RPCs exigem `platform_staff`, registrando cada alteração na trilha.
 */
export default async function PlatformSettingsPage() {
  await exigePlatformStaff();
  const [settings, tiers] = await Promise.all([
    (await getPlatformSettingsService()).get(),
    (await getPlatformPricingService()).getTiers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Regras que valem para todas as igrejas. Cada alteração fica registrada com quem fez.
        </p>
      </div>
      <SponsorPricingForm tiers={tiers} />
      <AutopatrocinioForm amountCents={settings.autopatrocinioAmountCents} />
      <PlatformSettingsForm settings={settings} />
      <p className="text-xs text-muted-foreground">
        Última alteração em{" "}
        {new Date(settings.updatedAt).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        })}
        .
      </p>
    </div>
  );
}
