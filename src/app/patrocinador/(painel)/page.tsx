import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CircleDollarSign, Church, HandHeart, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDueDate } from "@/features/sponsor/components/status-badges";
import { getSponsorService } from "@/server/sponsor";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Painel do patrocinador" };

const PAYMENT_STATE = {
  em_dia: { label: "Em dia", hint: "nenhuma fatura em aberto" },
  pendente: { label: "Pendente", hint: "há uma fatura para pagar" },
  sem_cobranca: { label: "Sem cobrança", hint: "nenhum patrocínio ativo" },
} as const;

export default async function SponsorHomePage() {
  const service = await getSponsorService();
  const [overview, tiers] = await Promise.all([service.getOverview(), service.getPriceTable()]);
  const { account } = overview;
  const payment = PAYMENT_STATE[overview.paymentState];
  const lastTier = tiers[tiers.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">Olá, {account.display_name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Seu apoio às igrejas</h1>
      </div>

      {overview.paymentState === "pendente" ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {account.billing_status === "overdue"
                ? "Sua última fatura está atrasada. Enquanto isso, não é possível apoiar novas igrejas."
                : "Falta concluir o pagamento para seu apoio aparecer nas igrejas."}
            </span>
            {overview.openInvoiceUrl ? (
              <a
                href={overview.openInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: "sm" })}
              >
                Pagar agora
              </a>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {overview.billingSyncPending ? (
        <Alert>
          <RefreshCw className="size-4" />
          <AlertDescription>
            Estamos atualizando o valor da sua assinatura no meio de pagamento. O total abaixo já é o
            que vale para a próxima cobrança.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Church}
          label="Patrocínios ativos"
          value={overview.billableCount}
          hint={
            overview.visibleCount > overview.billableCount
              ? `+${overview.visibleCount - overview.billableCount} até o fim do ciclo`
              : "igrejas que você apoia"
          }
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Total mensal"
          value={formatCents(overview.monthlyTotalCents)}
          hint="uma única cobrança no cartão"
        />
        <MetricCard icon={HandHeart} label="Pagamento" value={payment.label} hint={payment.hint} />
        <MetricCard
          icon={CalendarClock}
          label="Próximo vencimento"
          value={account.next_due_date && overview.billableCount > 0 ? formatDueDate(account.next_due_date) : "—"}
          hint="cobrança mensal recorrente"
        />
      </div>

      {overview.billableCount === 0 && overview.visibleCount === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Você ainda não apoia nenhuma igreja"
          description="Peça o link de patrocínio ao pastor, ou use o botão “Patrocinar” na página pública da igreja."
        />
      ) : (
        <div className="flex">
          <Link
            href="/patrocinador/patrocinios"
            className={buttonVariants({ variant: "outline" })}
          >
            Ver igrejas apoiadas
          </Link>
        </div>
      )}

      {tiers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Como o valor é calculado</CardTitle>
            <CardDescription>
              Quanto mais igrejas você apoia, menor o valor de cada nova. O total é sempre a soma
              das faixas abaixo, na ordem, até a quantidade de igrejas que você apoia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiers.map((tier) => (
                <li key={tier.position} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {tier.position === lastTier.position && tiers.length > 1
                      ? `${tier.position}ª igreja em diante`
                      : `${tier.position}ª igreja`}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatCents(tier.amountCents)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
