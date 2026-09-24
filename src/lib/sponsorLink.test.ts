import { describe, expect, it } from "vitest";
import {
  parseSponsorLink,
  sameSponsorLink,
  sponsorLinkHref,
  sponsorLinkToInput,
  WHATSAPP_GREETING,
} from "./sponsorLink";

function ok(input: string) {
  const r = parseSponsorLink(input);
  if (!r.ok) throw new Error(`esperava ok: ${r.message}`);
  return r.link;
}

describe("parseSponsorLink", () => {
  it("campo vazio é sem link", () => {
    expect(ok("")).toBeNull();
    expect(ok("   ")).toBeNull();
  });

  it("reconhece WhatsApp com ou sem pontuação e assume o Brasil", () => {
    expect(ok("(11) 91234-5678")).toEqual({ tipo: "whatsapp", valor: "5511912345678" });
    expect(ok("11912345678")).toEqual({ tipo: "whatsapp", valor: "5511912345678" });
    expect(ok("1132345678")).toEqual({ tipo: "whatsapp", valor: "551132345678" });
    expect(ok("+55 11 91234-5678")).toEqual({ tipo: "whatsapp", valor: "5511912345678" });
  });

  it("recusa número que não é telefone", () => {
    for (const ruim of ["12345", "(11) 1234", "0000000000000000"]) {
      expect(parseSponsorLink(ruim).ok, ruim).toBe(false);
    }
  });

  it("aceita site com ou sem esquema", () => {
    expect(ok("https://padaria.com.br/oferta")).toEqual({
      tipo: "link",
      valor: "https://padaria.com.br/oferta",
    });
    expect(ok("padaria.com.br")).toEqual({ tipo: "link", valor: "https://padaria.com.br/" });
    expect(ok("www.instagram.com/padaria")).toEqual({
      tipo: "link",
      valor: "https://www.instagram.com/padaria",
    });
  });

  it("recusa esquemas perigosos e endereços que enganam", () => {
    for (const ruim of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "ftp://arquivos.com.br",
      "https://banco.com@malicioso.com",
      "https://localhost",
      "http://192.168.0.1",
      "meu site.com",
      "sem-ponto",
    ]) {
      expect(parseSponsorLink(ruim).ok, ruim).toBe(false);
    }
  });

  it("recusa link acima do limite", () => {
    expect(parseSponsorLink(`https://a.com/${"x".repeat(300)}`).ok).toBe(false);
  });
});

describe("sponsorLinkHref", () => {
  it("monta o wa.me do número e devolve o site como está", () => {
    expect(sponsorLinkHref({ tipo: "whatsapp", valor: "5511912345678" })).toBe(
      "https://wa.me/5511912345678",
    );
    expect(sponsorLinkHref({ tipo: "link", valor: "https://padaria.com.br/" })).toBe(
      "https://padaria.com.br/",
    );
  });

  it("sem link, ou com valor fora do formato, a logo não é clicável", () => {
    expect(sponsorLinkHref({ tipo: null, valor: null })).toBeNull();
    expect(sponsorLinkHref({ tipo: "link", valor: "javascript:alert(1)" })).toBeNull();
    expect(sponsorLinkHref({ tipo: "whatsapp", valor: "abc" })).toBeNull();
    expect(sponsorLinkHref({ tipo: "outro", valor: "x" })).toBeNull();
  });
});

describe("mensagem do WhatsApp", () => {
  const whats = { tipo: "whatsapp", valor: "5511912345678" };

  it("na página da igreja, abre com a apresentação já digitada e codificada", () => {
    const href = sponsorLinkHref(whats, { comMensagem: true });

    expect(href).toMatch(/^https:\/\/wa\.me\/5511912345678\?text=/);
    expect(new URL(href!).searchParams.get("text")).toBe(WHATSAPP_GREETING);
  });

  it("a mensagem é a mesma para toda igreja e não cita nome nenhum", () => {
    // Nome de igreja aqui deixaria o patrocinador comparar o retorno de cada
    // página e cancelar o apoio às que menos trazem contato.
    expect(WHATSAPP_GREETING).toBe(
      "Olá! Encontrei seu contato na página da igreja e gostaria de saber mais.",
    );
  });

  it("site não ganha mensagem, e sem a opção o wa.me fica puro", () => {
    expect(sponsorLinkHref({ tipo: "link", valor: "https://a.com/" }, { comMensagem: true })).toBe(
      "https://a.com/",
    );
    expect(sponsorLinkHref(whats)).toBe("https://wa.me/5511912345678");
  });
});

describe("sponsorLinkToInput", () => {
  it("devolve o WhatsApp formatado e o site como está", () => {
    expect(sponsorLinkToInput({ tipo: "whatsapp", valor: "5511912345678" })).toBe(
      "(11) 91234-5678",
    );
    expect(sponsorLinkToInput({ tipo: "whatsapp", valor: "551132345678" })).toBe("(11) 3234-5678");
    expect(sponsorLinkToInput({ tipo: "link", valor: "https://a.com/" })).toBe("https://a.com/");
    expect(sponsorLinkToInput({ tipo: null, valor: null })).toBe("");
  });

  it("o que volta para o campo é interpretado como o mesmo link", () => {
    const original = ok("(11) 91234-5678");
    expect(ok(sponsorLinkToInput(original!))).toEqual(original);
  });
});

describe("sameSponsorLink", () => {
  it("compara par a par, tratando nulo como sem link", () => {
    expect(sameSponsorLink(null, null)).toBe(true);
    expect(sameSponsorLink({ tipo: "link", valor: "https://a.com/" }, null)).toBe(false);
    expect(
      sameSponsorLink(
        { tipo: "link", valor: "https://a.com/" },
        { tipo: "link", valor: "https://a.com/" },
      ),
    ).toBe(true);
  });
});
