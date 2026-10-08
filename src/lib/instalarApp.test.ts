import { describe, expect, it } from "vitest";
import { avisoLiberado, comoInstalar, ehIos, ehSafariNoIos } from "./instalarApp";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  ipadComoMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  firefoxPc: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
};

describe("comoInstalar", () => {
  it("já aberto como app: nada a oferecer", () => {
    expect(comoInstalar({ userAgent: UA.androidChrome, aberturaComoApp: true, temJanelaDeInstalar: true })).toBe(
      "ja_instalado",
    );
  });

  it("navegador que avisou que instala: botão", () => {
    expect(comoInstalar({ userAgent: UA.androidChrome, aberturaComoApp: false, temJanelaDeInstalar: true })).toBe(
      "botao",
    );
  });

  it("iPhone no Safari: instruções; iPhone no Chrome: pedir para abrir no Safari", () => {
    expect(comoInstalar({ userAgent: UA.iphoneSafari, aberturaComoApp: false, temJanelaDeInstalar: false })).toBe(
      "instrucoes_ios",
    );
    expect(comoInstalar({ userAgent: UA.iphoneChrome, aberturaComoApp: false, temJanelaDeInstalar: false })).toBe(
      "abrir_no_safari",
    );
  });

  it("iPad que se apresenta como Mac só conta como iOS quando tem toque", () => {
    expect(comoInstalar({ userAgent: UA.ipadComoMac, aberturaComoApp: false, temJanelaDeInstalar: false }, true)).toBe(
      "instrucoes_ios",
    );
    expect(comoInstalar({ userAgent: UA.ipadComoMac, aberturaComoApp: false, temJanelaDeInstalar: false }, false)).toBe(
      "indisponivel",
    );
  });

  it("navegador que não instala nem avisou: nada", () => {
    expect(comoInstalar({ userAgent: UA.firefoxPc, aberturaComoApp: false, temJanelaDeInstalar: false })).toBe(
      "indisponivel",
    );
  });

  it("detecção de iOS e de Safari", () => {
    expect(ehIos(UA.iphoneSafari)).toBe(true);
    expect(ehIos(UA.androidChrome)).toBe(false);
    expect(ehSafariNoIos(UA.iphoneSafari)).toBe(true);
    expect(ehSafariNoIos(UA.iphoneChrome)).toBe(false);
  });
});

describe("avisoLiberado", () => {
  it("nunca dispensado aparece; dispensado volta só depois de 30 dias", () => {
    const agora = Date.parse("2026-10-08T12:00:00Z");
    expect(avisoLiberado(null, agora)).toBe(true);
    expect(avisoLiberado(agora - 5 * 86_400_000, agora)).toBe(false);
    expect(avisoLiberado(agora - 31 * 86_400_000, agora)).toBe(true);
  });
});
