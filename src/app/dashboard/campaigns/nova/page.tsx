import type { Metadata } from "next";
import { HandCoins, Lock } from "lucide-react";
import { BotaoVoltar } from "@/components/botao-voltar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { NewCampaignForm } from "@/features/campaigns/components/new-campaign-form";
import { getCampaignsService } from "@/server/campaigns";
import { getActiveTenant } from "@/server/tenant";
import { canManageCampaigns } from "@/services/campaignsService";

export const metadata: Metadata = { title: "Nova campanha" };

export default async function NewCampaignPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // o layout já redirecionou

  const podeGerenciar = canManageCampaigns(active.role, active.acessos.includes("campaigns"));
  const igrejas = podeGerenciar ? await (await getCampaignsService()).listChurches(active.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <BotaoVoltar href="/dashboard/campaigns" />
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
          <HandCoins className="size-4" /> Arrecadação para projetos
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Nova campanha</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Nasce em rascunho. Depois de revisar, ative na tela de gerenciar para publicar na página da
          igreja.
        </p>
      </div>

      {!podeGerenciar ? (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            Só quem administra a igreja pode criar campanhas. Peça a um administrador.
          </AlertDescription>
        </Alert>
      ) : igrejas.length === 0 ? (
        <Alert>
          <AlertDescription>Nenhuma igreja encontrada nesta conta.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <NewCampaignForm igrejas={igrejas} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
