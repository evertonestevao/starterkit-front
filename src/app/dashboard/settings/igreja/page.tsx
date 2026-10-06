import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { ChurchProfileForm } from "@/features/church/components/church-profile-form";
import { SaudacaoForm } from "@/features/church/components/saudacao-form";
import { getSaudacaoDaEmpresa } from "@/server/saudacao";
import { getChurchProfileService } from "@/server/churchProfile";
import { getActiveTenant } from "@/server/tenant";
import { canEditChurchProfile } from "@/services/churchProfileService";

export const metadata: Metadata = { title: "Página da igreja" };

export default async function ChurchProfileSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  if (!canEditChurchProfile(active.role)) notFound();

  const igrejas = await (await getChurchProfileService()).list(active.id);

  const { churchId, saudacao } = await getSaudacaoDaEmpresa(active.id);

  return (
    <div className="flex flex-col gap-6">
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
      {churchId ? (
        <Card>
          <CardHeader>
            <CardTitle>Saudação das mensagens</CardTitle>
            <CardDescription>
              Como a igreja cumprimenta nas mensagens prontas de WhatsApp (saudade, pedido de visita, convite) e no
              e-mail de convite. Deixe em branco para usar &quot;A paz do Senhor&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SaudacaoForm churchId={churchId} saudacao={saudacao} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
