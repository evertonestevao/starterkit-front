import { describe, expect, it } from "vitest";
import { eventDateBadge, eventPrice, eventSummary, eventWhen } from "./churchEvents";

describe("eventWhen", () => {
  it("mostra o horário de Brasília, não o do servidor (UTC)", () => {
    // 21:00 UTC = 18:00 em Brasília.
    expect(eventWhen("2026-09-27T21:00:00Z", null)).toBe("Domingo, 27 de setembro · 18:00");
  });

  it("evento que termina no mesmo dia mostra o intervalo", () => {
    expect(eventWhen("2026-10-10T17:00:00Z", "2026-10-10T20:00:00Z")).toBe(
      "Sábado, 10 de outubro · 14:00 às 17:00",
    );
  });

  it("retiro de dois dias mostra início e fim por extenso", () => {
    expect(eventWhen("2026-10-17T11:00:00Z", "2026-10-18T20:00:00Z")).toBe(
      "Sábado, 17 de outubro, 08:00 até domingo, 18 de outubro, 17:00",
    );
  });

  it("não troca o dia quando o horário em UTC já virou o dia seguinte", () => {
    // 23:30 de sábado em Brasília = 02:30 de domingo em UTC.
    expect(eventDateBadge("2026-10-04T02:30:00Z")).toEqual({ dia: "03", mes: "OUT" });
  });
});

describe("eventPrice", () => {
  it("zero é gratuito; o resto em reais", () => {
    expect(eventPrice(0)).toBe("Gratuito");
    expect(eventPrice(18000).replace(/ /g, " ")).toBe("R$ 180,00");
  });
});

describe("eventSummary", () => {
  it("sem descrição, sem resumo", () => {
    expect(eventSummary(null)).toBeNull();
    expect(eventSummary("   ")).toBeNull();
  });

  it("corta em palavra inteira", () => {
    const resumo = eventSummary("Um fim de semana de comunhão, louvor e palavra para jovens de todas as idades", 40);
    expect(resumo).toBe("Um fim de semana de comunhão, louvor e…");
  });
});
