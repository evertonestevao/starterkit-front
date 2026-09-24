import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16 } from "./pixPayload";

/** Quebra o BR Code nos campos de primeiro nível (id -> valor). */
function campos(payload: string): Record<string, string> {
  const mapa: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    mapa[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return mapa;
}

describe("crc16", () => {
  // Vetor conhecido da especificação do BR Code.
  it("calcula o CRC do exemplo do Banco Central", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("buildPixPayload", () => {
  const base = { chave: "igreja@exemplo.org", titular: "Igreja Betel", cidade: "São Paulo" };

  it("monta o copia e cola com a chave e o titular", () => {
    const payload = buildPixPayload(base);

    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("igreja@exemplo.org");
    expect(payload).toContain("IGREJA BETEL");
    // Acento fora, caixa alta, cidade com 15 caracteres no máximo.
    expect(payload).toContain("SAO PAULO");
    expect(payload).toContain("5303986"); // moeda BRL
    expect(payload).toContain("5802BR");
  });

  it("fecha com um CRC que confere", () => {
    const payload = buildPixPayload(base);
    const semCrc = payload.slice(0, -4);

    expect(payload.slice(-8, -4)).toBe("6304");
    expect(crc16(semCrc)).toBe(payload.slice(-4));
  });

  it("corta nome e cidade nos limites da especificação", () => {
    const payload = buildPixPayload({
      chave: "11122233344",
      titular: "Comunidade Cristã Evangélica Renovada do Bairro Alto",
      cidade: "Santa Bárbara d'Oeste",
    });

    expect(payload).toContain("25COMUNIDADE CRISTA EVANG");
    expect(payload).toContain("15SANTA BARBARA D");
  });

  it("sem cidade informada, usa um padrão válido", () => {
    const payload = buildPixPayload({ chave: "x@y.z", titular: "Igreja" });

    expect(payload).toContain("6006CIDADE");
  });

  it("não leva valor nem txid fixo: quem doa escolhe quanto", () => {
    const campo = campos(buildPixPayload(base));

    expect(campo["54"]).toBeUndefined(); // valor
    expect(campo["62"]).toBe("0503***"); // txid "***" = sem identificador fixo
    expect(campo["53"]).toBe("986");
  });

  it("com valorCents, embute o campo 54 formatado com duas casas", () => {
    const campo = campos(buildPixPayload({ ...base, valorCents: 15050 }));
    expect(campo["54"]).toBe("150.50");
  });

  it("com txid, sanitiza para alfanumérico maiúsculo até 25 caracteres", () => {
    const campo = campos(
      buildPixPayload({ ...base, txid: "campanha-Reforma_2026!!!ExtraLongo" }),
    );
    // hífen, underscore e pontuação saem; o resto vira maiúsculo e corta em 25.
    expect(campo["62"]).toBe(`0525${"CAMPANHAREFORMA2026EXTRAL"}`);
  });

  it("continua fechando com um CRC que confere, com valor e txid juntos", () => {
    const payload = buildPixPayload({ ...base, valorCents: 5000, txid: "CAMP1" });
    const semCrc = payload.slice(0, -4);
    expect(crc16(semCrc)).toBe(payload.slice(-4));
  });
});
