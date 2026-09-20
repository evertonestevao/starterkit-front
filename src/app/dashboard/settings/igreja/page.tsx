import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { ChurchProfileForm } from "@/features/church/components/church-profile-form";
import { getChurchProfileService } from "@/server/churchProfile";
import { getActiveTenant } from "@/server/tenant";
import { canEditChurchProfile } from "@/services/churchProfileService";

export const metadata: Metadata = { title: "Página da igreja" };

export default async function ChurchProfileSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  if (!canEditChurchProfile(active.role)) notFound();

  const igrejas = await (await getChurchProfileService()).list(active.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Página da igreja</CardTitle>
        <CardDescription>
          O que aparece para quem abre o link, escaneia o QR Code ou encosta o celular na tag.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChurchProfileForm igrejas={igrejas} appUrl={getServerEnv().APP_URL} />
      </CardContent>
    </Card>
  );
}
