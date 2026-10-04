import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, HandCoins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CampaignCoverForm,
  CampaignDonationsList,
  CampaignFeedbackForm,
  CampaignStatusActions,
  EditCampaignForm,
} from "@/features/campaigns/components/campaign-admin-forms";
import { getServerEnv } from "@/config/env";
import { getCampaignsService } from "@/server/campaigns";
import { getActiveTenant } from "@/server/tenant";
import { canManageCampaigns } from "@/services/campaignsService";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Campanha" };

const STATUS_LABEL = { rascunho: "Rascunho", ativa: "Ativa", encerrada: "Encerrada" } as const;

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  if (!canManageCampaigns(active.role, active.acessos.includes("campaigns"))) notFound();

  const service = await getCampaignsService();
  const actor = { companyId: active.id, role: active.role, liberado: active.acessos.includes("campaigns") };
  const campanha = await service.get(actor, id).catch(() => null);
  if (!campanha) notFound();

  const doacoes = await service.listDonations(actor, id);

  const base = getServerEnv().APP_URL.replace(/\/+$/, "");
  const percentual =
    campanha.metaCents > 0
      ? Math.min(100, Math.round((campanha.totalArrecadadoLiquidoCents / campanha.metaCents) * 100))
      : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Campanhas
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <HandCoins className="size-4" /> {campanha.churchName}
          </div>
          <Badge variant={campanha.status === "ativa" ? "default" : "outline"}>
            {STATUS_LABEL[campanha.status]}
          </Badge>
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{campanha.titulo}</h2>
        {campanha.status !== "rascunho" ? (
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentual}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCents(campanha.totalArrecadadoLiquidoCents)} de {formatCents(campanha.metaCents)} arrecadados
              ({percentual}%)
            </p>
          </div>
        ) : null}
        {campanha.status !== "rascunho" ? (
          <a
            href={`${base}/campanhas/${campanha.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver na página pública <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Situação</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignStatusActions campanha={campanha} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capa</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignCoverForm campanha={campanha} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados da campanha</CardTitle>
        </CardHeader>
        <CardContent>
          <EditCampaignForm campanha={campanha} />
        </CardContent>
      </Card>

      {campanha.metodoRecebimento === "pix" || doacoes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Doações</CardTitle>
            <CardDescription>
              {campanha.metodoRecebimento === "pix"
                ? "Confira o extrato ou o comprovante recebido pelo WhatsApp antes de confirmar."
                : "Confirmadas automaticamente pelo provedor de pagamento."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignDonationsList campaignId={campanha.id} doacoes={doacoes} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Devolutiva</CardTitle>
          <CardDescription>
            Depois de encerrar, conte para quem doou o que foi feito com o dinheiro arrecadado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignFeedbackForm campanha={campanha} />
        </CardContent>
      </Card>
    </div>
  );
}
