import { describe, expect, it, vi } from "vitest";
import { churchTagUrl, isAutomatedVisit, parseVisitOrigin } from "@/lib/churchVisits";
import { createChurchVisitService, type VisitRequest } from "./churchVisitService";

const IGREJA = "33333333-3333-4333-8333-333333333333";
const CELULAR =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function pedido(overrides: Partial<VisitRequest> = {}): VisitRequest {
  return {
    churchId: IGREJA,
    origem: "qr",
    visitorKey: "hash-do-ip",
    userAgent: CELULAR,
    purpose: null,
    nextPrefetch: null,
    ...overrides,
  };
}

function build({ primeira = true, falhaAoGravar = false } = {}) {
  const repo = {
    insertVisit: vi.fn(async () => {
      if (falhaAoGravar) throw new Error("banco fora");
    }),
  };
  const deduper = { firstInWindow: vi.fn(async () => primeira) };
  const log = { error: vi.fn() };
  return { repo, deduper, log, service: createChurchVisitService({ repo, deduper, log }) };
}

describe("parseVisitOrigin", () => {
  it("reconhece qr e nfc, sem diferença de caixa", () => {
    expect(parseVisitOrigin("qr")).toBe("qr");
    expect(parseVisitOrigin("NFC")).toBe("nfc");
    expect(parseVisitOrigin(["qr", "nfc"])).toBe("qr");
  });

  it("qualquer outra coisa (ou nada) é link", () => {
    expect(parseVisitOrigin(undefined)).toBe("link");
    expect(parseVisitOrigin("instagram")).toBe("link");
  });
});

describe("churchTagUrl", () => {
  it("monta a URL do QR/NFC com a origem", () => {
    expect(churchTagUrl("https://tagigreja.com.br/", "betel", "nfc")).toBe(
      "https://tagigreja.com.br/igreja/betel?origem=nfc",
    );
  });
});

describe("isAutomatedVisit", () => {
  it("celular comum conta", () => {
    expect(isAutomatedVisit({ userAgent: CELULAR, purpose: null, nextPrefetch: null })).toBe(false);
  });

  it("prévia de link do WhatsApp e robô de busca não contam", () => {
    expect(isAutomatedVisit({ userAgent: "WhatsApp/2.23.20.0", purpose: null, nextPrefetch: null })).toBe(true);
    expect(isAutomatedVisit({ userAgent: "Googlebot/2.1", purpose: null, nextPrefetch: null })).toBe(true);
  });

  it("pré-carregamento e pedido sem user-agent não contam", () => {
    expect(isAutomatedVisit({ userAgent: CELULAR, purpose: "prefetch", nextPrefetch: null })).toBe(true);
    expect(isAutomatedVisit({ userAgent: CELULAR, purpose: null, nextPrefetch: "1" })).toBe(true);
    expect(isAutomatedVisit({ userAgent: null, purpose: null, nextPrefetch: null })).toBe(true);
  });
});

describe("record", () => {
  it("grava a visita com a origem, sem nada da pessoa", async () => {
    const { repo, service } = build();

    expect(await service.record(pedido())).toBe(true);
    expect(repo.insertVisit).toHaveBeenCalledWith({ churchId: IGREJA, origem: "qr" });
  });

  it("a mesma pessoa de novo na janela não conta duas vezes", async () => {
    const { repo, deduper, service } = build({ primeira: false });

    expect(await service.record(pedido())).toBe(false);
    expect(deduper.firstInWindow).toHaveBeenCalledWith(`${IGREJA}:hash-do-ip`);
    expect(repo.insertVisit).not.toHaveBeenCalled();
  });

  it("robô nem chega à deduplicação", async () => {
    const { deduper, service } = build();

    await service.record(pedido({ userAgent: "facebookexternalhit/1.1" }));

    expect(deduper.firstInWindow).not.toHaveBeenCalled();
  });

  it("falha ao gravar não derruba nada: loga e segue", async () => {
    const { log, service } = build({ falhaAoGravar: true });

    await expect(service.record(pedido())).resolves.toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});
