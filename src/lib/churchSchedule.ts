import type { ChurchScheduleItem } from "@/types/database";

/**
 * Regras puras da programação da igreja (cultos semanais e especiais).
 *
 * Datas de item especial são só DIA ("2026-10-04"), sem fuso. Cuidado com
 * `new Date("2026-10-04")`: o JS lê como meia-noite UTC, e em Brasília isso
 * ainda é dia 3 — o culto apareceria um dia antes. Aqui a data é lida ao
 * meio-dia UTC, que é o mesmo dia em qualquer fuso do Brasil.
 */

export const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** "19:30:00" → "19:30". */
export function formatHora(hora: string): string {
  return hora.slice(0, 5);
}

export interface DiaDaProgramacao<T extends ChurchScheduleItem = ChurchScheduleItem> {
  dia: number;
  rotulo: string;
  itens: T[];
}

/** A semana agrupada por dia, domingo primeiro, e cada dia por hora. Dia vazio não aparece. */
export function groupWeekly<T extends ChurchScheduleItem>(itens: T[]): DiaDaProgramacao<T>[] {
  const semanais = itens.filter((i) => i.tipo === "semanal" && i.dia_semana !== null);
  return DIAS_DA_SEMANA.map((rotulo, dia) => ({
    dia,
    rotulo,
    itens: semanais
      .filter((i) => i.dia_semana === dia)
      .sort((a, b) => a.hora.localeCompare(b.hora)),
  })).filter((d) => d.itens.length > 0);
}

/** Hoje em Brasília, como "2026-09-20". */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Especiais de hoje em diante, do mais perto ao mais longe. */
export function upcomingSpecials<T extends ChurchScheduleItem>(itens: T[], agora: Date = new Date()): T[] {
  const hoje = hojeEmBrasilia(agora);
  return itens
    .filter((i) => i.tipo === "especial" && i.data !== null && i.data >= hoje)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
}

function dataAoMeioDia(data: string): Date {
  return new Date(`${data}T12:00:00Z`);
}

/** "Domingo, 4 de outubro · 18:00". */
export function specialWhen(data: string, hora: string): string {
  const d = dataAoMeioDia(data);
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(d);
  const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${diaMes} · ${formatHora(hora)}`;
}

/** Selo de data do especial: { dia: "04", mes: "OUT" }. */
export function specialBadge(data: string): { dia: string; mes: string } {
  const d = dataAoMeioDia(data);
  return {
    dia: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit" }).format(d),
    mes: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" })
      .format(d)
      .replace(".", "")
      .toUpperCase(),
  };
}
