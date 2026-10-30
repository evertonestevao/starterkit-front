import type { CommissionValue, ResellerAuditEntry } from "./types";

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatCommission(value: CommissionValue): string {
  return value.commission_type === "percent"
    ? `${Number(value.commission_percent).toLocaleString("pt-BR")}%`
    : formatCents(value.commission_fixed_cents ?? 0);
}

export function formatDuration(months: number | null): string {
  if (months === null) return "Enquanto pagar";
  return months === 1 ? "1 mês" : `${months} meses`;
}

export const STATUS_LABEL = { pending: "Pendente", paid: "Pago", reversed: "Revertido" } as const;

const TRACKED_FIELDS: Record<string, string> = {
  commission_type: "tipo",
  commission_percent: "percentual",
  commission_fixed_cents: "valor fixo (centavos)",
  duration_months: "duração",
  is_override: "ajuste manual",
  amount_cents: "valor (centavos)",
  status: "status",
  ended_at: "encerrado em",
};

/** "percentual: 30 → 40" para o histórico. Só campos relevantes que mudaram. */
export function describeChanges(entry: ResellerAuditEntry): string[] {
  if (!entry.old_values || !entry.new_values) return [entry.action === "INSERT" ? "Criado" : entry.action];
  return Object.entries(TRACKED_FIELDS).flatMap(([field, label]) => {
    const before = entry.old_values?.[field] ?? null;
    const after = entry.new_values?.[field] ?? null;
    return before === after ? [] : [`${label}: ${before ?? "—"} → ${after ?? "—"}`];
  });
}
