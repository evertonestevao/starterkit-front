import type { Metadata } from "next";
import { ExternalLink, Receipt } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChargeStatusBadge,
  formatDateTime,
  formatDueDate,
} from "@/features/sponsor/components/status-badges";
import { cn } from "@/lib/utils";
import { getSponsorService } from "@/server/sponsor";
import { formatCents } from "@/services/sponsorPricing";
import type { SponsorCharge } from "@/types/sponsorship";

export const metadata: Metadata = { title: "Pagamentos" };

function InvoiceLink({ charge }: { charge: SponsorCharge }) {
  if (!charge.invoice_url) return <span className="text-muted-foreground">—</span>;
  const open = charge.status === "pending" || charge.status === "overdue";
  return (
    <a
      href={charge.invoice_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ size: "sm", variant: open ? "default" : "ghost" }), "gap-1.5")}
    >
      {open ? "Pagar" : "Ver fatura"}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function churchesLabel(count: number): string {
  return `${count} ${count === 1 ? "igreja" : "igrejas"}`;
}

export default async function SponsorPaymentsPage() {
  const service = await getSponsorService();
  const charges = await service.listCharges();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uma cobrança por mês, somando todas as igrejas que você apoiava naquele ciclo.
        </p>
      </div>

      {charges.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma cobrança ainda"
          description="Assim que o primeiro ciclo for gerado, ele aparece aqui."
        />
      ) : (
        <>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Igrejas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-32 text-right">Fatura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell className="font-medium">{formatDueDate(charge.due_date)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {churchesLabel(charge.active_count)}
                    </TableCell>
                    <TableCell>
                      <ChargeStatusBadge status={charge.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {charge.paid_at ? formatDateTime(charge.paid_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(charge.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <InvoiceLink charge={charge} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {charges.map((charge) => (
              <Card key={charge.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Vence {formatDueDate(charge.due_date)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {churchesLabel(charge.active_count)}
                        {charge.paid_at ? ` · pago em ${formatDateTime(charge.paid_at)}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {formatCents(charge.amount_cents)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <ChargeStatusBadge status={charge.status} />
                    <InvoiceLink charge={charge} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
