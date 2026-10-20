/**
 * Datas de cobrança em YYYY-MM-DD (sem I/O). O vencimento é um DIA, não um
 * instante: calcular em UTC faria uma cobrança criada às 22h de Brasília
 * vencer "amanhã".
 */

const BILLING_TIME_ZONE = "America/Sao_Paulo";

export function todayInBillingZone(now: Date): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último
 * dia dele (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = (targetIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
