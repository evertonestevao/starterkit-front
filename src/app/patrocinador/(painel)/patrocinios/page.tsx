import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FlashToast } from "@/components/flash-toast";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CancelSponsorshipButton } from "@/features/sponsor/components/cancel-sponsorship-button";
import {
  formatDateTime,
  SponsorshipStatusBadge,
} from "@/features/sponsor/components/status-badges";
import { getSponsorService } from "@/server/sponsor";
import { formatCents, totalForCount } from "@/services/sponsorPricing";
import type { SponsorshipView } from "@/types/sponsorship";

export const metadata: Metadata = { title: "Meus patrocínios" };

function canCancel(s: SponsorshipView): boolean {
  return s.status === "active" || s.status === "pending_payment";
}

function detail(s: SponsorshipView): string | null {
  if (s.status === "cancel_scheduled" && s.endsAt) return `Exibido até ${formatDateTime(s.endsAt)}`;
  if (s.status === "canceled" && s.endsAt) return `Encerrado em ${formatDateTime(s.endsAt)}`;
  if (s.position) return `${s.position}ª posição`;
  return null;
}

export default async function SponsorshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}) {
  const { novo } = await searchParams;
  const service = await getSponsorService();
  const [sponsorships, tiers] = await Promise.all([
    service.listSponsorships(),
    service.getPriceTable(),
  ]);

  const billable = sponsorships.filter((s) => s.currentAmountCents !== null);
  const total = totalForCount(billable.length, tiers);
  // Cancelar qualquer cobrável deixa N-1 cobráveis: o total novo é o mesmo
  // para todas, porque o preço é da posição, não da igreja.
  const totalAfterCancel = billable.length > 0 ? totalForCount(billable.length - 1, tiers) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patrocínios</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          O valor de cada igreja vem da posição dela na sua lista, na ordem em que você começou a
          apoiar. Ao cancelar uma, as demais sobem de posição e o total é recalculado.
        </p>
      </div>

      {novo ? <FlashToast message="Patrocínio registrado. Obrigado pelo seu apoio!" /> : null}

      {sponsorships.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Nenhum patrocínio ainda"
          description="Peça o link de patrocínio ao pastor, ou use o botão “Patrocinar” na página pública da igreja."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Posição</TableHead>
                  <TableHead className="text-right">Valor atual</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsorships.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.churchName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <SponsorshipStatusBadge status={s.status} />
                        {s.status === "cancel_scheduled" || s.status === "canceled" ? (
                          <span className="text-xs text-muted-foreground">{detail(s)}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.position ? `${s.position}ª` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.currentAmountCents !== null ? formatCents(s.currentAmountCents) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canCancel(s) ? (
                        <CancelSponsorshipButton
                          sponsorshipId={s.id}
                          churchName={s.churchName}
                          newTotalCents={totalAfterCancel}
                          isPending={s.status === "pending_payment"}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total mensal</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCents(total)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Mobile: cards (CLAUDE.md — tabelas têm modo alternativo) */}
          <div className="flex flex-col gap-3 md:hidden">
            {sponsorships.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.churchName}</p>
                      {detail(s) ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{detail(s)}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {s.currentAmountCents !== null ? formatCents(s.currentAmountCents) : "—"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <SponsorshipStatusBadge status={s.status} />
                    {canCancel(s) ? (
                      <CancelSponsorshipButton
                        sponsorshipId={s.id}
                        churchName={s.churchName}
                        newTotalCents={totalAfterCancel}
                        isPending={s.status === "pending_payment"}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Total mensal</span>
              <span className="font-semibold tabular-nums">{formatCents(total)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
