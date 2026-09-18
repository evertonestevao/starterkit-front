import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Church, EyeOff, Landmark, Share2, TimerReset } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SponsorCardActions } from "@/features/church/components/sponsor-card-actions";
import { getChurchDomainService } from "@/server/churchDomain";
import { getChurchSponsorsService } from "@/server/churchSponsors";
import { getActiveTenant } from "@/server/tenant";
import type { CompanySponsor } from "@/services/churchSponsorsService";

export const metadata: Metadata = { title: "Patrocinadores" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function SponsorCard({ sponsor, showChurch }: { sponsor: CompanySponsor; showChurch: boolean }) {
  const leaving = sponsor.status === "cancel_scheduled";

  return (
    <Card className={sponsor.hiddenAt ? "opacity-70" : undefined}>
      <CardContent className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-primary">
          {sponsor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo externo do patrocinador
            <img
              src={sponsor.logoUrl}
              alt=""
              className="size-full rounded-lg object-cover"
            />
          ) : (
            initials(sponsor.sponsorName)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{sponsor.sponsorName}</p>
            {leaving ? <Badge variant="outline">Sai em {formatDate(sponsor.endsAt)}</Badge> : null}
            {sponsor.hiddenAt ? (
              <Badge variant="secondary" className="gap-1">
                <EyeOff className="size-3" aria-hidden />
                Escondido
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Apoia desde {formatDate(sponsor.activatedAt)}
            {showChurch ? ` · ${sponsor.churchName}` : ""}
          </p>
          <div className="mt-3">
            <SponsorCardActions
              sponsorshipId={sponsor.sponsorshipId}
              hidden={Boolean(sponsor.hiddenAt)}
              denunciaAberta={sponsor.denunciaAberta}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SponsorsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const [summary, domains] = await Promise.all([
    (await getChurchSponsorsService()).getSummary(active.id),
    (await getChurchDomainService()).listForCompany({ companyId: active.id, role: active.role }),
  ]);
  const inviteUrl = domains[0]?.sponsorInviteUrl ?? null;
  const showChurch = domains.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Landmark className="size-4" /> Quem caminha junto
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Patrocinadores</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Negócios e pessoas que sustentam a presença digital da sua igreja. O nome deles aparece
          na página pública, e o apoio é pago diretamente à plataforma — a igreja não paga nada.
          Se não quiser alguém na sua página, esconda: o apoio continua, a marca sai.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={Building2}
          label="Patrocinadores ativos"
          value={summary.activeCount}
          hint="aparecem na sua página"
        />
        <MetricCard
          icon={TimerReset}
          label="Saindo"
          value={summary.leavingCount}
          hint="cancelaram; exibidos até o fim do ciclo"
        />
        <MetricCard
          icon={Church}
          label="Igrejas com apoio"
          value={summary.churchesWithSponsors}
          hint={`de ${domains.length}`}
        />
        {summary.hiddenCount > 0 ? (
          <MetricCard
            icon={EyeOff}
            label="Escondidos"
            value={summary.hiddenCount}
            hint="fora da página; a cobrança deles segue"
          />
        ) : null}
      </div>

      {inviteUrl ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="size-4 text-primary" />
              Convide um patrocinador
            </CardTitle>
            <CardDescription>
              Envie este link para negócios da comunidade. Quem abrir vê o convite e assina sem
              precisar de conta antes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 font-mono text-sm break-all">{inviteUrl}</span>
            <Link
              href="/dashboard/settings/domain"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Copiar em Configurações
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {summary.sponsors.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhum patrocinador ainda"
          description="Compartilhe o link de convite com negócios que já apoiam a comunidade — padaria, mercado, clínica, escola."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.sponsors.map((sponsor) => (
            <SponsorCard
              key={sponsor.sponsorshipId}
              sponsor={sponsor}
              showChurch={showChurch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
