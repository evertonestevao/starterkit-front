import { describe, expect, it } from "vitest";
import {
  dnsInstructionsFor,
  isApexDomain,
  isReservedHost,
  isValidHostname,
  normalizeHostname,
  recordNameFor,
} from "./domain";

const PRIMARY = "tagigreja.com.br";

describe("normalizeHostname", () => {
  it("tira protocolo, caminho, porta e ponto final", () => {
    expect(normalizeHostname("  HTTPS://IgrejaX.com.br/  ")).toBe("igrejax.com.br");
    expect(normalizeHostname("http://igrejax.com.br:3000/eventos?a=1")).toBe(
      "igrejax.com.br",
    );
    expect(normalizeHostname("igrejax.com.br.")).toBe("igrejax.com.br");
  });

  it("descarta credenciais coladas na URL", () => {
    // "user@host" é a forma clássica de disfarçar o host real de quem lê rápido.
    expect(normalizeHostname("https://igrejax.com.br@evil.com")).toBe("evil.com");
  });
});

describe("isValidHostname", () => {
  it("aceita host comum", () => {
    expect(isValidHostname("igrejax.com.br")).toBe(true);
    expect(isValidHostname("www.igreja-x.org")).toBe(true);
  });

  it("recusa host sem ponto, IP e label longo demais", () => {
    expect(isValidHostname("localhost")).toBe(false);
    expect(isValidHostname("192.168.0.1")).toBe(false);
    expect(isValidHostname(`${"a".repeat(64)}.com`)).toBe(false);
    expect(isValidHostname("-igreja.com.br")).toBe(false);
    expect(isValidHostname("igreja_x.com.br")).toBe(false);
  });
});

describe("isApexDomain / recordNameFor", () => {
  it("trata sufixo de dois níveis como raiz", () => {
    expect(isApexDomain("igrejax.com.br")).toBe(true);
    expect(recordNameFor("igrejax.com.br")).toBe("@");
    expect(isApexDomain("www.igrejax.com.br")).toBe(false);
    expect(recordNameFor("www.igrejax.com.br")).toBe("www");
  });

  it("trata TLD simples pela regra de dois labels", () => {
    expect(isApexDomain("igrejax.org")).toBe(true);
    expect(isApexDomain("app.igrejax.org")).toBe(false);
    expect(recordNameFor("app.igrejax.org")).toBe("app");
  });

  it("devolve o caminho completo em subdomínio de vários níveis", () => {
    expect(recordNameFor("sede.norte.igrejax.com.br")).toBe("sede.norte");
  });
});

describe("isReservedHost", () => {
  it("bloqueia o host da plataforma e seus subdomínios", () => {
    expect(isReservedHost("tagigreja.com.br", PRIMARY)).toBe(true);
    expect(isReservedHost("qualquer.tagigreja.com.br", PRIMARY)).toBe(true);
  });

  it("bloqueia infraestrutura", () => {
    expect(isReservedHost("meu-projeto.vercel.app", PRIMARY)).toBe(true);
    expect(isReservedHost("cname.vercel-dns.com", PRIMARY)).toBe(true);
    expect(isReservedHost("xyz.supabase.co", PRIMARY)).toBe(true);
  });

  it("libera domínio comum de igreja", () => {
    expect(isReservedHost("igrejax.com.br", PRIMARY)).toBe(false);
    // Não confundir sufixo com substring: o host abaixo não é da plataforma.
    expect(isReservedHost("naotagigreja.com.br", PRIMARY)).toBe(false);
  });
});

describe("dnsInstructionsFor", () => {
  const base = { aRecord: "76.76.21.21", cnameTarget: "cname.vercel-dns.com" };

  it("gera A na raiz e CNAME no subdomínio", () => {
    const apex = dnsInstructionsFor({ domain: "igrejax.com.br", ...base });
    expect(apex).toHaveLength(1);
    expect(apex[0]).toMatchObject({ type: "A", name: "@", value: "76.76.21.21" });

    const sub = dnsInstructionsFor({ domain: "www.igrejax.com.br", ...base });
    expect(sub[0]).toMatchObject({
      type: "CNAME",
      name: "www",
      value: "cname.vercel-dns.com",
    });
  });

  it("acrescenta o desafio TXT quando o provedor pede", () => {
    const records = dnsInstructionsFor({
      domain: "igrejax.com.br",
      ...base,
      challenges: [
        {
          type: "TXT",
          domain: "_vercel.igrejax.com.br",
          value: "vc-domain-verify=abc",
        },
      ],
    });
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      type: "TXT",
      name: "_vercel",
      value: "vc-domain-verify=abc",
    });
  });
});
