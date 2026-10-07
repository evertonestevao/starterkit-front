import type { SponsorChurchMonthVisits } from "@/types/metrics";

/** "2026-09-01" dos últimos `count` meses, do mais recente ao mais antigo (fuso de Brasília). */
export function lastMonths(count: number, now: Date = new Date()): string[] {
  const [year, month] = now
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push(d.toISOString().slice(0, 10));
  }
  return months;
}

export interface ChurchVisitsRow {
  churchId: string;
  churchName: string;
  /** Visitas por mês, na mesma ordem de `months`. Mês sem visita = 0. */
  porMes: number[];
  total: number;
}

/** Linhas (igreja × mês) viram uma tabela por igreja, com zero nos meses vazios. */
export function pivotVisitsByChurch(rows: SponsorChurchMonthVisits[], months: string[]): ChurchVisitsRow[] {
  const byChurch = new Map<string, ChurchVisitsRow>();
  for (const row of rows) {
    const index = months.indexOf(row.mes);
    if (index === -1) continue;
    let entry = byChurch.get(row.churchId);
    if (!entry) {
      entry = { churchId: row.churchId, churchName: row.churchName, porMes: months.map(() => 0), total: 0 };
      byChurch.set(row.churchId, entry);
    }
    entry.porMes[index] += row.visitas;
    entry.total += row.visitas;
  }
  return [...byChurch.values()].sort((a, b) => b.total - a.total || a.churchName.localeCompare(b.churchName));
}

/** "set/26" */
export function formatMonthShort(isoMonth: string): string {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15))
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .replace(". de ", "/")
    .replace(" de ", "/")
    .replace(".", "");
}
