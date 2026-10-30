import type { CommissionFilters } from "./schemas";
import { STATUS_LABEL } from "./format";
import type { AdminCommission } from "./types";

/**
 * Fechamento do mês (plano §9). Separador ";" e decimal com vírgula: é o que o Excel em
 * pt-BR abre em colunas. BOM para os acentos.
 */

const SEPARATOR = ";";

/** Sem período na tela, exporta o mês atual. */
export function withDefaultPeriod(filters: CommissionFilters, now: Date = new Date()): CommissionFilters {
  if (filters.from || filters.to) return filters;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    ...filters,
    from: iso(new Date(Date.UTC(year, month, 1))),
    to: iso(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** Nome de cliente é digitado por terceiros: "=..." viraria fórmula na planilha. */
function cell(value: string | number | null): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function row(values: Array<string | number | null>): string {
  return values.map(cell).join(SEPARATOR);
}

export function buildCommissionsCsv(commissions: AdminCommission[]): string {
  const lines = [
    row(["Vendedor", "Cliente", "Plano", "Data", "Valor-base", "Comissão", "Status", "Pago em"]),
    ...commissions.map((commission) =>
      row([
        commission.reseller_name,
        commission.client_name,
        commission.plan_name,
        commission.created_at.slice(0, 10),
        money(commission.base_amount_cents),
        money(commission.amount_cents),
        STATUS_LABEL[commission.status],
        commission.paid_at?.slice(0, 10) ?? null,
      ]),
    ),
  ];

  const totals = new Map<string, { pending: number; paid: number }>();
  for (const commission of commissions) {
    const total = totals.get(commission.reseller_name) ?? { pending: 0, paid: 0 };
    // Revertido não entra no fechamento.
    if (commission.status === "pending") total.pending += commission.amount_cents;
    if (commission.status === "paid") total.paid += commission.amount_cents;
    totals.set(commission.reseller_name, total);
  }

  lines.push("", row(["Total por vendedor", "Pendente", "Pago", "Total"]));
  for (const [name, total] of [...totals].sort(([a], [b]) => a.localeCompare(b, "pt-BR"))) {
    lines.push(row([name, money(total.pending), money(total.paid), money(total.pending + total.paid)]));
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}
