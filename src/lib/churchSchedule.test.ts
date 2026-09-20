import { describe, expect, it } from "vitest";
import type { ChurchScheduleItem } from "@/types/database";
import {
  formatHora,
  groupWeekly,
  hojeEmBrasilia,
  specialBadge,
  specialWhen,
  upcomingSpecials,
} from "./churchSchedule";

function item(parcial: Partial<ChurchScheduleItem>): ChurchScheduleItem {
  return {
    id: parcial.titulo ?? "x",
    church_id: "igreja",
    titulo: "Culto",
    tipo: "semanal",
    dia_semana: 0,
    data: null,
    hora: "19:00:00",
    descricao: null,
    local: null,
    ...parcial,
  };
}

describe("groupWeekly", () => {
  it("domingo primeiro, cada dia por hora, dia vazio fora", () => {
    const semana = groupWeekly([
      item({ titulo: "Estudo", dia_semana: 3, hora: "19:30:00" }),
      item({ titulo: "Noite", dia_semana: 0, hora: "18:00:00" }),
      item({ titulo: "Manhã", dia_semana: 0, hora: "09:00:00" }),
      item({ titulo: "Especial", tipo: "especial", dia_semana: null, data: "2026-10-04" }),
    ]);

    expect(semana.map((d) => d.rotulo)).toEqual(["Domingo", "Quarta"]);
    expect(semana[0].itens.map((i) => i.titulo)).toEqual(["Manhã", "Noite"]);
  });
});

describe("upcomingSpecials", () => {
  const agora = new Date("2026-09-20T15:00:00Z"); // 12:00 de 20/09 em Brasília

  it("só de hoje em diante, do mais perto ao mais longe", () => {
    const lista = upcomingSpecials(
      [
        item({ titulo: "Passou", tipo: "especial", dia_semana: null, data: "2026-09-13" }),
        item({ titulo: "Depois", tipo: "especial", dia_semana: null, data: "2026-10-04" }),
        item({ titulo: "Hoje", tipo: "especial", dia_semana: null, data: "2026-09-20" }),
        item({ titulo: "Semanal", dia_semana: 0 }),
      ],
      agora,
    );
    expect(lista.map((i) => i.titulo)).toEqual(["Hoje", "Depois"]);
  });

  it("usa o dia de Brasília: 23h de sábado aqui ainda é sábado", () => {
    // 02:00 UTC de domingo = 23:00 de sábado em Brasília.
    expect(hojeEmBrasilia(new Date("2026-09-20T02:00:00Z"))).toBe("2026-09-19");
  });
});

describe("datas de especial", () => {
  it("não volta um dia por causa do fuso", () => {
    expect(specialWhen("2026-10-04", "18:00:00")).toBe("Domingo, 4 de outubro · 18:00");
    expect(specialBadge("2026-10-04")).toEqual({ dia: "04", mes: "OUT" });
  });

  it("hora sem segundos", () => {
    expect(formatHora("09:00:00")).toBe("09:00");
  });
});
