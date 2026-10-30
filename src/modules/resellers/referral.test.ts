import { describe, expect, it, vi } from "vitest";
import {
  buildReferralCookie,
  buildReferralRedirect,
  buildRefRewrite,
  normalizeReferralCode,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
} from "./referralCookie";
import { createReferralService, type ReferralRepository } from "./referralService";

function makeRepo(validCodes: string[]): ReferralRepository & { isValidCode: ReturnType<typeof vi.fn> } {
  return {
    isValidCode: vi.fn(async (code: string) => validCodes.includes(code)),
    recordCompanyReferral: vi.fn(async () => "referral-id"),
  };
}

describe("normalizeReferralCode", () => {
  it("aceita o formato do banco, sem diferenciar maiúsculas", () => {
    expect(normalizeReferralCode("  Maria-01 ")).toBe("maria-01");
  });

  it.each([null, undefined, "", "a b", "a--b", "-a", "a;b", "a=b", "x".repeat(65)])(
    "recusa %s",
    (value) => {
      expect(normalizeReferralCode(value)).toBeNull();
    },
  );
});

describe("buildReferralCookie", () => {
  it("define HttpOnly, SameSite=Lax e cerca de 30 dias", () => {
    const cookie = buildReferralCookie("maria", false);
    expect(cookie).toContain("reseller_ref=maria");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}`);
    expect(REFERRAL_COOKIE_MAX_AGE_SECONDS).toBe(2_592_000);
    expect(cookie).not.toContain("Secure");
  });

  it("acrescenta Secure quando pedido", () => {
    expect(buildReferralCookie("maria", true)).toContain("Secure");
  });
});

describe("buildReferralRedirect", () => {
  it("vai para a página de venda padrão, sem parâmetro", () => {
    expect(buildReferralRedirect(new URLSearchParams())).toBe("/");
  });

  it("preserva utm_* e remove ref e next", () => {
    const params = new URLSearchParams("utm_source=meta&ref=x&next=/signup&gclid=1");
    expect(buildReferralRedirect(params)).toBe("/signup?utm_source=meta&gclid=1");
  });

  it.each(["https://malicioso.com", "//malicioso.com", "/dashboard", "/signup/../dashboard"])(
    "ignora next=%s (open redirect)",
    (next) => {
      expect(buildReferralRedirect(new URLSearchParams({ next }))).toBe("/");
    },
  );
});

describe("buildRefRewrite", () => {
  it("leva ?ref= de página de venda para a rota do link, com os demais parâmetros", () => {
    expect(buildRefRewrite("/", new URLSearchParams("ref=maria&utm_source=meta"))).toBe(
      "/r/maria?utm_source=meta&next=%2F",
    );
  });

  it("não se aplica sem ref nem fora das páginas de venda", () => {
    expect(buildRefRewrite("/", new URLSearchParams("utm_source=meta"))).toBeNull();
    expect(buildRefRewrite("/dashboard", new URLSearchParams("ref=maria"))).toBeNull();
  });

  it("não deixa o valor escapar da rota", () => {
    expect(buildRefRewrite("/", new URLSearchParams({ ref: "../dashboard" }))).toBe(
      "/r/..%2Fdashboard?next=%2F",
    );
  });
});

describe("resolveClick", () => {
  it("grava código válido", async () => {
    const service = createReferralService({ repo: makeRepo(["maria"]) });
    await expect(service.resolveClick({ code: "MARIA", existingCookie: null })).resolves.toBe("maria");
  });

  it("ignora código inválido e formato ruim sem erro", async () => {
    const repo = makeRepo(["maria"]);
    const service = createReferralService({ repo });
    await expect(service.resolveClick({ code: "joao", existingCookie: null })).resolves.toBeNull();
    await expect(service.resolveClick({ code: "a;b", existingCookie: null })).resolves.toBeNull();
    expect(repo.isValidCode).toHaveBeenCalledTimes(1);
  });

  it("vale o primeiro vendedor: cookie válido não é sobrescrito", async () => {
    const service = createReferralService({ repo: makeRepo(["maria", "joao"]) });
    await expect(service.resolveClick({ code: "joao", existingCookie: "maria" })).resolves.toBeNull();
  });

  it("troca cookie cujo código deixou de valer", async () => {
    const service = createReferralService({ repo: makeRepo(["joao"]) });
    await expect(service.resolveClick({ code: "joao", existingCookie: "suspenso" })).resolves.toBe("joao");
  });

  it("código inválido não apaga nem troca o cookie existente", async () => {
    const service = createReferralService({ repo: makeRepo(["maria"]) });
    await expect(service.resolveClick({ code: "joao", existingCookie: "maria" })).resolves.toBeNull();
  });

  it("falha do banco vira silêncio e não fica em cache", async () => {
    const repo = makeRepo(["maria"]);
    repo.isValidCode.mockRejectedValueOnce(new Error("fora do ar"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = createReferralService({ repo });
    await expect(service.resolveClick({ code: "maria", existingCookie: null })).resolves.toBeNull();
    await expect(service.resolveClick({ code: "maria", existingCookie: null })).resolves.toBe("maria");
    errorLog.mockRestore();
  });
});

describe("cache da validação", () => {
  it("não consulta o banco a cada clique, inclusive para código inválido", async () => {
    const repo = makeRepo(["maria"]);
    const service = createReferralService({ repo });
    for (let i = 0; i < 100; i++) {
      await service.isValid("maria");
      await service.isValid("joao");
    }
    expect(repo.isValidCode).toHaveBeenCalledTimes(2);
  });

  it("revalida depois do TTL (vendedor suspenso para de valer)", async () => {
    let time = 0;
    const repo = makeRepo(["maria"]);
    const service = createReferralService({ repo, now: () => time, cacheTtlMs: 1000 });
    await expect(service.isValid("maria")).resolves.toBe(true);
    repo.isValidCode.mockResolvedValue(false);
    time = 999;
    await expect(service.isValid("maria")).resolves.toBe(true);
    time = 1000;
    await expect(service.isValid("maria")).resolves.toBe(false);
  });

  it("não cresce sem limite com códigos aleatórios", async () => {
    const repo = makeRepo([]);
    const service = createReferralService({ repo, maxCacheEntries: 2 });
    await service.isValid("a");
    await service.isValid("b");
    await service.isValid("c");
    await service.isValid("a");
    expect(repo.isValidCode).toHaveBeenCalledTimes(4);
  });
});

describe("recordForCompany", () => {
  it("grava o código normalizado do cookie", async () => {
    const repo = makeRepo(["maria"]);
    const service = createReferralService({ repo });
    await service.recordForCompany({ companyId: "c1", userId: "u1", cookieValue: "Maria" });
    expect(repo.recordCompanyReferral).toHaveBeenCalledWith("c1", "maria", "u1");
  });

  it("sem cookie ou com cookie adulterado não chama o banco", async () => {
    const repo = makeRepo([]);
    const service = createReferralService({ repo });
    await service.recordForCompany({ companyId: "c1", userId: "u1", cookieValue: undefined });
    await service.recordForCompany({ companyId: "c1", userId: "u1", cookieValue: "x'; drop" });
    expect(repo.recordCompanyReferral).not.toHaveBeenCalled();
  });
});

describe("rate limit do link", () => {
  function makeLimited() {
    let time = 0;
    const repo = makeRepo(["maria"]);
    const service = createReferralService({
      repo,
      now: () => time,
      clicksPerWindow: 2,
      clickWindowMs: 1000,
      maxCacheEntries: 3,
    });
    const click = (clientKey: string) => service.resolveClick({ code: "maria", existingCookie: null, clientKey });
    return { click, repo, advance: (ms: number) => (time += ms) };
  }

  it("além do limite, ignora em silêncio", async () => {
    const { click } = makeLimited();
    await expect(click("ip-1")).resolves.toBe("maria");
    await expect(click("ip-1")).resolves.toBe("maria");
    await expect(click("ip-1")).resolves.toBeNull();
  });

  it("um IP não afeta outro, e a janela reinicia", async () => {
    const { click, advance } = makeLimited();
    await click("ip-1");
    await click("ip-1");
    await click("ip-1");
    await expect(click("ip-2")).resolves.toBe("maria");
    advance(1000);
    await expect(click("ip-1")).resolves.toBe("maria");
  });

  it("não consulta o banco quando bloqueado", async () => {
    const { click, repo, advance } = makeLimited();
    await click("ip-1");
    await click("ip-1");
    advance(0);
    repo.isValidCode.mockClear();
    await click("ip-1");
    expect(repo.isValidCode).not.toHaveBeenCalled();
  });

  it("não cresce sem limite com IPs novos", async () => {
    const { click } = makeLimited();
    for (const ip of ["a", "b", "c", "d", "e"]) {
      await expect(click(ip)).resolves.toBe("maria");
    }
  });
});
