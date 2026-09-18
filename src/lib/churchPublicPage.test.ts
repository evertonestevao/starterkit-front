import { describe, expect, it } from "vitest";
import {
  churchInitials,
  directionsUrl,
  normalizeSocialLinks,
  orderServiceTimes,
} from "./churchPublicPage";

describe("orderServiceTimes", () => {
  it("põe domingo primeiro e escreve o dia direito, como quer que tenha vindo", () => {
    expect(
      orderServiceTimes({ "Quarta-feira": "19:30", domingo: "09:00 e 18:00", terca: "20:00" }),
    ).toEqual([
      { dia: "Domingo", horario: "09:00 e 18:00" },
      { dia: "Terça", horario: "20:00" },
      { dia: "Quarta", horario: "19:30" },
    ]);
  });

  it("chave que não é dia entra no fim, e horário vazio some", () => {
    expect(orderServiceTimes({ "santa ceia": "1º domingo", sexta: "", sabado: "19h" })).toEqual([
      { dia: "Sábado", horario: "19h" },
      { dia: "Santa ceia", horario: "1º domingo" },
    ]);
  });

  it("sem horários, sem seção", () => {
    expect(orderServiceTimes(null)).toEqual([]);
    expect(orderServiceTimes({})).toEqual([]);
    expect(orderServiceTimes(["domingo"])).toEqual([]);
  });
});

describe("normalizeSocialLinks", () => {
  it("monta link de verdade a partir de @usuário e número de WhatsApp", () => {
    expect(
      normalizeSocialLinks({ instagram: "@igrejaesperanca", whatsapp: "(11) 98888-7777" }),
    ).toEqual([
      { kind: "instagram", rotulo: "Instagram", href: "https://instagram.com/igrejaesperanca" },
      { kind: "whatsapp", rotulo: "WhatsApp", href: "https://wa.me/5511988887777" },
    ]);
  });

  it("recusa javascript: e qualquer esquema que não seja http(s)", () => {
    expect(
      normalizeSocialLinks({
        site: "javascript:alert(document.cookie)",
        youtube: "data:text/html,<script>alert(1)</script>",
        facebook: "https://facebook.com/igreja",
      }),
    ).toEqual([{ kind: "facebook", rotulo: "Facebook", href: "https://facebook.com/igreja" }]);
  });

  it("descarta o que não vira link — melhor faltar botão do que botão morto", () => {
    expect(normalizeSocialLinks({ instagram: "#", whatsapp: "123", louvores: "https://x.com" })).toEqual([]);
  });

  it("domínio sem esquema ganha https", () => {
    expect(normalizeSocialLinks({ site: "igrejaesperanca.com.br" })).toEqual([
      { kind: "site", rotulo: "Site", href: "https://igrejaesperanca.com.br/" },
    ]);
  });
});

describe("directionsUrl", () => {
  it("sem endereço, sem botão de como chegar", () => {
    expect(directionsUrl("Igreja X", null)).toBeNull();
    expect(directionsUrl("Igreja X", "   ")).toBeNull();
  });

  it("usa o nome junto para o mapa acertar quando falta a cidade", () => {
    expect(directionsUrl("Igreja Esperança", "Rua da Comunidade, 84")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Igreja%20Esperan%C3%A7a%2C%20Rua%20da%20Comunidade%2C%2084",
    );
  });
});

describe("churchInitials", () => {
  it("pula palavras genéricas", () => {
    expect(churchInitials("Igreja Vida Nova")).toBe("VN");
    expect(churchInitials("Comunidade Betel")).toBe("B");
    expect(churchInitials("Igreja Esperança")).toBe("E");
  });

  it("nome só com palavra genérica ainda tem monograma", () => {
    expect(churchInitials("Igreja")).toBe("I");
  });
});
