import { describe, expect, it } from "vitest";
import {
  brasiliaLocalToIso,
  eventDateBadge,
  eventPrice,
  eventSummary,
  eventWhen,
  isoToBrasiliaLocal,
  parseBrlToCents,
} from "./churchEvents";

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

describe("brasiliaLocalToIso", () => {
  it("interpreta o horário digitado como de Brasília", () => {
    expect(brasiliaLocalToIso("2026-10-17T19:00")).toBe("2026-10-17T22:00:00.000Z");
  });

  it("ida e volta dão o mesmo horário no formulário", () => {
    expect(isoToBrasiliaLocal(brasiliaLocalToIso("2026-10-17T08:30")!)).toBe("2026-10-17T08:30");
  });

  it("recusa o que não é data e hora", () => {
    expect(brasiliaLocalToIso("")).toBeNull();
    expect(brasiliaLocalToIso("17/10/2026 19:00")).toBeNull();
    expect(brasiliaLocalToIso("2026-13-45T99:00")).toBeNull();
  });
});

describe("parseBrlToCents", () => {
  it("entende os jeitos comuns de digitar valor", () => {
    expect(parseBrlToCents("180")).toBe(18000);
    expect(parseBrlToCents("180,00")).toBe(18000);
    expect(parseBrlToCents("R$ 1.250,50")).toBe(125050);
    expect(parseBrlToCents("1.250")).toBe(125000);
    expect(parseBrlToCents("49,9")).toBe(4990);
    expect(parseBrlToCents("1250.5")).toBe(125050);
  });

  it("vazio ou zero é gratuito", () => {
    expect(parseBrlToCents("")).toBe(0);
    expect(parseBrlToCents(null)).toBe(0);
    expect(parseBrlToCents("0,00")).toBe(0);
  });

  it("recusa texto que não é valor, em vez de gravar preço errado", () => {
    expect(parseBrlToCents("cento e oitenta")).toBeNull();
    expect(parseBrlToCents("-50")).toBeNull();
    expect(parseBrlToCents("10,999")).toBeNull();
  });
});

