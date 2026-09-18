import type { Metadata } from "next";
import { ArrowRight, Church, Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileChangeReview } from "@/features/platform/components/profile-change-review";
import { getPlatformModerationService } from "@/server/platform";
import type { PendingProfileChange } from "@/types/sponsorship";

export const metadata: Metadata = { title: "Alterações pendentes" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Antes e depois lado a lado: é o que a decisão precisa mostrar. */
function NameDiff({ change }: { change: PendingProfileChange }) {
  if (!change.novoDisplayName) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground line-through">{change.atualDisplayName}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="font-medium">{change.novoDisplayName}</span>
    </div>
  );
}

export default async function PlatformChangesPage() {
  const service = await getPlatformModerationService();
  const pendentes = await service.listPendingProfileChanges();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alterações pendentes</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Nome e logo de patrocinadores aparecem nas páginas públicas das igrejas. Nada entra no ar
          sem passar por aqui — até a decisão, as igrejas seguem exibindo o perfil anterior.
        </p>
      </div>

      {pendentes.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nada esperando"
          description="Quando um patrocinador pedir alteração de nome ou logo, ela aparece aqui e você recebe um email."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {pendentes.map((change) => (
            <Card key={change.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {change.atualDisplayName}
                  <Badge variant="outline" className="gap-1">
                    <Church className="size-3" aria-hidden />
                    {change.igrejas} {change.igrejas === 1 ? "igreja" : "igrejas"}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {change.sponsorEmail} · pedido em {formatDateTime(change.createdAt)}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <NameDiff change={change} />
                {change.novoLogoPath ? (
                  <p className="text-sm text-muted-foreground">
                    Enviou um logo novo: <span className="font-mono text-xs">{change.novoLogoPath}</span>
                  </p>
                ) : null}
                <ProfileChangeReview change={change} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
