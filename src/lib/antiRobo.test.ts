import { describe, expect, it } from "vitest";
import { ipDoPedido, pareceRobo } from "./antiRobo";

const AGORA = 1_800_000_000_000;

describe("pareceRobo", () => {
  it("gente: campo escondido vazio e alguns segundos para preencher", () => {
    expect(pareceRobo({ isca: "", iniciadoEm: String(AGORA - 8_000) }, AGORA)).toBe(false);
    expect(pareceRobo({ isca: null, iniciadoEm: String(AGORA - 2_000) }, AGORA)).toBe(false);
  });

  it("robô: preencheu o campo que ninguém vê", () => {
    expect(pareceRobo({ isca: "http://spam.example", iniciadoEm: String(AGORA - 60_000) }, AGORA)).toBe(true);
  });

  it("robô: enviou rápido demais", () => {
    expect(pareceRobo({ isca: "", iniciadoEm: String(AGORA - 300) }, AGORA)).toBe(true);
  });

  it("hora adulterada (texto ou no futuro) é tratada como robô", () => {
    expect(pareceRobo({ isca: "", iniciadoEm: "abc" }, AGORA)).toBe(true);
    expect(pareceRobo({ isca: "", iniciadoEm: String(AGORA + 3_600_000) }, AGORA)).toBe(true);
  });

  it("sem a hora (navegador sem JavaScript) não barra: o limite de envios cuida", () => {
    expect(pareceRobo({ isca: "", iniciadoEm: null }, AGORA)).toBe(false);
    expect(pareceRobo({ isca: "", iniciadoEm: "" }, AGORA)).toBe(false);
  });
});

describe("ipDoPedido", () => {
  const cabecalhos = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

  it("usa o primeiro endereço do x-forwarded-for; depois o x-real-ip", () => {
    expect(ipDoPedido(cabecalhos({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(ipDoPedido(cabecalhos({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(ipDoPedido(cabecalhos({}))).toBe("desconhecido");
  });
});
