import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/services/sponsorPricing";
import { getCampaignsService } from "@/server/campaigns";
import { getActiveTenant } from "@/server/tenant";
import { canManageCampaigns, type CompanyCampaign } from "@/services/campaignsService";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Campanhas" };

const STATUS_LABEL: Record<CompanyCampaign["status"], { texto: string; variant: "outline" | "default" | "secondary" }> = {
  rascunho: { texto: "Rascunho", variant: "outline" },
  ativa: { texto: "Ativa", variant: "default" },
  encerrada: { texto: "Encerrada", variant: "secondary" },
};

function CampaignCard({ campanha, mostrarIgreja }: { campanha: CompanyCampaign; mostrarIgreja: boolean }) {
  const percentual = Math.min(100, Math.round((campanha.totalArrecadadoLiquidoCents / campanha.metaCents) * 100));
  const status = STATUS_LABEL[campanha.status];

  return (
    <Link href={`/dashboard/campaigns/${campanha.id}`}>
      <Card className="h-full overflow-hidden transition-colors hover:border-primary/50">
        <div className="aspect-[2/1] w-full bg-muted">
          {campanha.fotoCapaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- capa em storage externo
            <img
              src={campanha.fotoCapaUrl}
              alt={`Capa de ${campanha.titulo}`}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <HandCoins className="size-8" aria-hidden />
            </div>
          )}
        </div>
        <CardContent className="flex flex-col gap-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{campanha.titulo}</p>
            <Badge variant={status.variant} className="shrink-0">
              {status.texto}
            </Badge>
          </div>
          {mostrarIgreja ? <p className="text-xs text-muted-foreground">{campanha.churchName}</p> : null}

          {campanha.status !== "rascunho" ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${percentual}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCents(campanha.totalArrecadadoLiquidoCents)} de {formatCents(campanha.metaCents)} ·{" "}
                {percentual}%
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Meta: {formatCents(campanha.metaCents)}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function CampaignsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const podeGerenciar = canManageCampaigns(active.role);
  const campanhas = await (await getCampaignsService()).list(active.id);
  const igrejas = new Set(campanhas.map((c) => c.churchId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <HandCoins className="size-4" /> Arrecadação para projetos
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Campanhas</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Reforma, ação social, evento — cada campanha tem meta, história e progresso próprios na
            página da igreja.
          </p>
        </div>
        {podeGerenciar ? (
          <Link
            href="/dashboard/campaigns/nova"
            className={cn(buttonVariants(), "gap-2 self-start sm:self-auto")}
          >
            <Plus className="size-4" />
            Nova campanha
          </Link>
        ) : null}
      </div>

      {campanhas.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nenhuma campanha ainda"
          description="Crie a primeira campanha para começar a arrecadar para um projeto."
          action={
            podeGerenciar ? (
              <Link href="/dashboard/campaigns/nova" className={buttonVariants()}>
                Nova campanha
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campanhas.map((campanha) => (
            <CampaignCard key={campanha.id} campanha={campanha} mostrarIgreja={igrejas.size > 1} />
          ))}
        </div>
      )}
    </div>
  );
}
