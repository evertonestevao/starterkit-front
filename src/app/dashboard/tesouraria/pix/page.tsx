import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvisoDoacoes } from "@/features/church/components/aviso-doacoes";
import { PixForm } from "@/features/church/components/pix-form";
import { getChurchPixService } from "@/server/churchPix";
import { getActiveTenant } from "@/server/tenant";
import { canEditPix } from "@/services/churchPixService";

export const metadata: Metadata = { title: "Chave PIX" };

/**
 * Chave PIX dos dízimos e ofertas. Mora na Tesouraria; com a Tesouraria
 * desligada, Configurações mostra esta mesma página (a chave também serve à
 * página pública, campanhas e vendas).
 */
export default async function ChavePixPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Member não chega aqui nem pela URL; o service e a RLS recusam de novo.
  if (!canEditPix(active.role)) notFound();

  const igrejas = await (await getChurchPixService()).listChurches(active.id);

  return (
    <>
      <AvisoDoacoes />
      <Card>
        <CardHeader>
          <CardTitle>Dízimos e ofertas por PIX</CardTitle>
          <CardDescription>
            A doação vai direto do banco de quem doa para o da igreja. A plataforma não recebe, não repassa e não cobra
            taxa — ela só mostra a chave e o QR Code na página.
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
    </>
  );
}
