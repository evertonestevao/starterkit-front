import type { Metadata } from "next";
import { ArrowRight, Church, Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileChangeReview } from "@/features/platform/components/profile-change-review";
import { SecurityHoldList } from "@/features/platform/components/security-hold-list";
import { sponsorLinkHref } from "@/lib/sponsorLink";
import { getPendingLogoUrl, getPlatformModerationService } from "@/server/platform";
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

/**
 * Destino da logo, antes e depois. O endereço aparece POR EXTENSO e não é um
 * link clicável: quem modera precisa ler para onde aponta (e reparar em
 * `paypa1.com`), e abrir um endereço suspeito não deve estar a um clique.
 */
function LinkDiff({ change }: { change: PendingProfileChange }) {
  if (!change.novoLinkAlterado) return null;
  const atual = sponsorLinkHref({ tipo: change.atualLinkTipo, valor: change.atualLinkValor });
  const novo = sponsorLinkHref({ tipo: change.novoLinkTipo, valor: change.novoLinkValor });
  const rotulo = (tipo: string | null) => (tipo === "whatsapp" ? "WhatsApp" : "site");
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">Link da logo</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground line-through break-all">{atual ?? "sem link"}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium break-all">
          {novo ? `${novo} (${rotulo(change.novoLinkTipo)})` : "remover o link"}
        </span>
      </div>
    </div>
  );
}

export default async function PlatformChangesPage() {
  const service = await getPlatformModerationService();
  const [pendentes, travadas] = await Promise.all([
    service.listPendingProfileChanges(),
    service.listSecurityHolds(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alterações pendentes</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Nome, logo e link de patrocinadores aparecem nas páginas públicas das igrejas. Nada entra no ar
          sem passar por aqui — até a decisão, as igrejas seguem exibindo o perfil anterior.
        </p>
      </div>

      {/* Vem antes da fila: conta travada é gente esperando para voltar a
          usar o que paga, e some da fila normal justamente por estar travada. */}
      <SecurityHoldList holds={travadas} />

      {pendentes.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nada esperando"
          description="Quando um patrocinador pedir alteração de nome, logo ou link, ela aparece aqui e você recebe um email."
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
                <LinkDiff change={change} />
                {change.novoLogoPath ? (
                  <div className="flex flex-wrap items-center gap-4">
                    {change.atualLogoUrl ? (
                      <figure className="flex flex-col items-center gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- logo em storage externo */}
                        <img
                          src={change.atualLogoUrl}
                          alt=""
                          className="size-16 rounded-lg border object-contain"
                        />
                        <figcaption className="text-xs text-muted-foreground">atual</figcaption>
                      </figure>
                    ) : null}
                    <figure className="flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- logo em storage externo */}
                      <img
                        src={getPendingLogoUrl(change.novoLogoPath)}
                        alt="Logo enviado pelo patrocinador, aguardando conferência"
                        className="size-16 rounded-lg border object-contain"
                      />
                      <figcaption className="text-xs font-medium">proposto</figcaption>
                    </figure>
                  </div>
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
