import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PixForm } from "@/features/church/components/pix-form";
import { getChurchPixService } from "@/server/churchPix";
import { getActiveTenant } from "@/server/tenant";
import { canEditPix } from "@/services/churchPixService";

export const metadata: Metadata = { title: "Dízimos e ofertas" };

export default async function PixSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Member não chega aqui nem pela URL; o service e a RLS recusam de novo.
  if (!canEditPix(active.role)) notFound();

  const igrejas = await (await getChurchPixService()).listChurches(active.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dízimos e ofertas por PIX</CardTitle>
        <CardDescription>
          A doação vai direto do banco de quem doa para o da igreja. A plataforma não recebe, não
          repassa e não cobra taxa — ela só mostra a chave e o QR Code na página.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {igrejas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>
        ) : (
          <PixForm igrejas={igrejas} />
        )}
      </CardContent>
    </Card>
  );
}
