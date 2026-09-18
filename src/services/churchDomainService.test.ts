import { describe, expect, it, vi } from "vitest";
import type { DomainProvider } from "@/adapters/domain/DomainProvider";
import { isAppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { Church, ChurchDomainStatus } from "@/types/database";
import type { ProviderDomainState } from "@/types/domain";
import {
  createChurchDomainService,
  isPastDeadline,
  normalizeDomainInput,
  resolveDomainStatus,
  type ChurchDomainRepository,
  type ChurchDomainStatusWriter,
  type DomainActor,
  type DomainStatusUpdate,
  type PendingDomain,
} from "./churchDomainService";

const APP_URL = "https://tagigreja.com.br";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const CHURCH_ID = "33333333-3333-4333-8333-333333333333";

const ADMIN: DomainActor = { companyId: COMPANY_ID, role: "admin" };

function makeChurch(overrides: Partial<Church> = {}): Church {
  return {
    id: CHURCH_ID,
    company_id: COMPANY_ID,
    parent_id: null,
    name: "Igreja X",
    slug: "igreja-x",
    logo_url: null,
    address: null,
    service_times: null,
    social_links: null,
    path: "igreja-x",
    template_mode: "inherit",
    template_id: null,
    public_code: "igreja-x",
    pix_chave: null,
    pix_titular: null,
    dominio_customizado: null,
    dominio_status: "nao_configurado",
    dominio_suporte_pago: false,
    dominio_verificacao: null,
    dominio_verificado_em: null,
    dominio_ultimo_erro: null,
    dominio_solicitado_em: null,
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Harness {
  repo: ChurchDomainRepository;
  statusWriter: ChurchDomainStatusWriter;
  provider: DomainProvider;
  calls: {
    claimed: Array<{ churchId: string; domain: string }>;
    verifications: Array<{ churchId: string; status: ChurchDomainStatus }>;
    cleared: string[];
    applied: Array<{ churchId: string; update: DomainStatusUpdate }>;
    providerAdded: string[];
    providerRemoved: string[];
  };
}

function makeHarness(options: {
  church?: Church;
  pending?: PendingDomain[];
  providerState?: ProviderDomainState;
  onAdd?: (domain: string) => Promise<ProviderDomainState>;
  onVerify?: (domain: string) => Promise<ProviderDomainState>;
}): Harness {
  let church = options.church ?? makeChurch();
  const calls: Harness["calls"] = {
    claimed: [],
    verifications: [],
    cleared: [],
    applied: [],
    providerAdded: [],
    providerRemoved: [],
  };

  const defaultState: ProviderDomainState = options.providerState ?? {
    verified: false,
    misconfigured: true,
    challenges: [
      { type: "TXT", domain: "_vercel.igrejax.com.br", value: "vc-domain-verify=abc" },
    ],
  };

  const repo: ChurchDomainRepository = {
    async findById() {
      return church;
    },
    async listByCompany() {
      return [church];
    },
    async claim(churchId, domain) {
      calls.claimed.push({ churchId, domain });
      church = {
        ...church,
        dominio_customizado: domain,
        dominio_status: "pendente_dns",
        dominio_solicitado_em: "2026-09-16T00:00:00.000Z",
      };
      return church;
    },
    async saveVerification(churchId, _challenges, status) {
      calls.verifications.push({ churchId, status });
    },
    async clear(churchId) {
      calls.cleared.push(churchId);
      church = { ...church, dominio_customizado: null, dominio_status: "nao_configurado" };
    },
  };

  const statusWriter: ChurchDomainStatusWriter = {
    async applyStatus(churchId, update) {
      calls.applied.push({ churchId, update });
    },
    async listPendingVerification() {
      return options.pending ?? [];
    },
  };

  const provider: DomainProvider = {
    name: "test",
    dns: { aRecord: "76.76.21.21", cnameTarget: "cname.vercel-dns.com" },
    async addDomain(domain) {
      calls.providerAdded.push(domain);
      return options.onAdd ? options.onAdd(domain) : defaultState;
    },
    async getDomainState() {
      return defaultState;
    },
    async verifyDomain(domain) {
      return options.onVerify ? options.onVerify(domain) : defaultState;
    },
    async removeDomain(domain) {
      calls.providerRemoved.push(domain);
    },
  };

  return { repo, statusWriter, provider, calls };
}

function makeService(harness: Harness, rateLimiter?: RateLimiter) {
  return createChurchDomainService({
    repo: harness.repo,
    statusWriter: harness.statusWriter,
    provider: harness.provider,
    appUrl: APP_URL,
    rateLimiter,
    now: () => new Date("2026-09-16T12:00:00.000Z"),
  });
}

const ACTIVE: ProviderDomainState = { verified: true, misconfigured: false, challenges: [] };

describe("normalizeDomainInput", () => {
  it("normaliza o que o usuário digitou", () => {
    expect(normalizeDomainInput(" HTTPS://IgrejaX.com.br/ ", APP_URL)).toBe(
      "igrejax.com.br",
    );
  });

  it("recusa vazio, formato inválido e host da plataforma", () => {
    for (const input of ["", "   ", "igreja x", "http://", "localhost", 42, null]) {
      expect(() => normalizeDomainInput(input, APP_URL)).toThrow();
    }
    expect(() => normalizeDomainInput("tagigreja.com.br", APP_URL)).toThrowError(
      /reservado/i,
    );
    expect(() => normalizeDomainInput("qualquer.tagigreja.com.br", APP_URL)).toThrowError(
      /reservado/i,
    );
  });
});

describe("resolveDomainStatus", () => {
  it("só fica ativo com posse verificada E DNS apontado", () => {
    expect(resolveDomainStatus({ verified: false, misconfigured: true, challenges: [] })).
      toMatchObject({ status: "pendente_dns" });
    expect(resolveDomainStatus({ verified: true, misconfigured: true, challenges: [] })).
      toMatchObject({ status: "pendente_dns" });
    expect(resolveDomainStatus(ACTIVE)).toMatchObject({ status: "ativo" });
  });
});

describe("claimDomain", () => {
  it("reserva no banco antes de chamar o provedor e guarda o desafio", async () => {
    const harness = makeHarness({});
    const view = await makeService(harness).claimDomain(
      CHURCH_ID,
      "igrejax.com.br",
      ADMIN,
    );

    expect(harness.calls.claimed).toEqual([
      { churchId: CHURCH_ID, domain: "igrejax.com.br" },
    ]);
    expect(harness.calls.providerAdded).toEqual(["igrejax.com.br"]);
    expect(harness.calls.verifications).toEqual([
      { churchId: CHURCH_ID, status: "pendente_dns" },
    ]);
    expect(view.status).toBe("pendente_dns");
    // A tela recebe as instruções já montadas: A na raiz + TXT do desafio.
    expect(view.dns.map((r) => r.type)).toEqual(["A", "TXT"]);
    // O endereço padrão continua ali, seja qual for o estado do domínio.
    expect(view.defaultUrl).toBe("https://tagigreja.com.br/igreja/igreja-x");
  });

  it("desfaz a reserva quando o provedor recusa o domínio", async () => {
    const harness = makeHarness({
      onAdd: async () => {
        throw new Error("domínio já em uso");
      },
    });

    await expect(
      makeService(harness).claimDomain(CHURCH_ID, "igrejax.com.br", ADMIN),
    ).rejects.toThrow();
    // Sem isso, o host ficaria preso a esta igreja para sempre pelo índice único.
    expect(harness.calls.cleared).toEqual([CHURCH_ID]);
  });

  it("promove na hora quando o DNS já apontava antes do cadastro", async () => {
    const harness = makeHarness({ onAdd: async () => ACTIVE });
    const view = await makeService(harness).claimDomain(
      CHURCH_ID,
      "igrejax.com.br",
      ADMIN,
    );

    // A RPC do client recebe `verificando`; quem grava `ativo` é o statusWriter.
    expect(harness.calls.verifications).toEqual([
      { churchId: CHURCH_ID, status: "verificando" },
    ]);
    expect(harness.calls.applied[0].update).toMatchObject({ status: "ativo" });
    expect(view.status).toBe("ativo");
    expect(view.customUrl).toBe("https://igrejax.com.br");
  });

  it("nega igreja de outra empresa como inexistente", async () => {
    const harness = makeHarness({ church: makeChurch({ company_id: OTHER_COMPANY_ID }) });

    await expect(
      makeService(harness).claimDomain(CHURCH_ID, "igrejax.com.br", ADMIN),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "not_found");
    expect(harness.calls.claimed).toHaveLength(0);
  });

  it("nega member mesmo dentro da própria empresa", async () => {
    const harness = makeHarness({});

    await expect(
      makeService(harness).claimDomain(CHURCH_ID, "igrejax.com.br", {
        companyId: COMPANY_ID,
        role: "member",
      }),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "forbidden");
  });

  it("nega igreja sem dono (linha de demonstração)", async () => {
    const harness = makeHarness({ church: makeChurch({ company_id: null }) });

    await expect(
      makeService(harness).claimDomain(CHURCH_ID, "igrejax.com.br", ADMIN),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "not_found");
  });

  it("consome rate limit por empresa", async () => {
    const consumed: string[] = [];
    const limiter: RateLimiter = {
      async consume(key) {
        consumed.push(key);
      },
    };
    const harness = makeHarness({});
    await makeService(harness, limiter).claimDomain(CHURCH_ID, "igrejax.com.br", ADMIN);
    expect(consumed).toEqual([`domain-claim:${COMPANY_ID}`]);
  });

  it("solta o domínio antigo no provedor ao trocar", async () => {
    const harness = makeHarness({
      church: makeChurch({
        dominio_customizado: "antigo.com.br",
        dominio_status: "ativo",
      }),
    });

    await makeService(harness).claimDomain(CHURCH_ID, "novo.com.br", ADMIN);
    expect(harness.calls.providerRemoved).toEqual(["antigo.com.br"]);
  });
});

describe("refreshDomain", () => {
  it("promove a ativo com data de verificação quando o provedor confirma", async () => {
    const harness = makeHarness({
      church: makeChurch({
        dominio_customizado: "igrejax.com.br",
        dominio_status: "pendente_dns",
      }),
      onVerify: async () => ACTIVE,
    });

    const view = await makeService(harness).refreshDomain(CHURCH_ID, ADMIN);

    expect(harness.calls.applied[0].update).toMatchObject({
      status: "ativo",
      verifiedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(view.status).toBe("ativo");
  });

  it("não derruba domínio ativo quando o provedor falha", async () => {
    const harness = makeHarness({
      church: makeChurch({
        dominio_customizado: "igrejax.com.br",
        dominio_status: "ativo",
      }),
      onVerify: async () => {
        throw new Error("provedor fora do ar");
      },
    });

    await expect(makeService(harness).refreshDomain(CHURCH_ID, ADMIN)).rejects.toThrow();
    expect(harness.calls.applied[0].update).toMatchObject({ status: "ativo" });
  });

  it("recusa verificar quando não há domínio cadastrado", async () => {
    const harness = makeHarness({});
    await expect(
      makeService(harness).refreshDomain(CHURCH_ID, ADMIN),
    ).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "validation_error",
    );
  });
});

describe("removeDomain", () => {
  it("limpa dos dois lados e devolve a igreja ao endereço padrão", async () => {
    const harness = makeHarness({
      church: makeChurch({
        dominio_customizado: "igrejax.com.br",
        dominio_status: "ativo",
      }),
    });

    const view = await makeService(harness).removeDomain(CHURCH_ID, ADMIN);

    expect(harness.calls.providerRemoved).toEqual(["igrejax.com.br"]);
    expect(harness.calls.cleared).toEqual([CHURCH_ID]);
    expect(view.status).toBe("nao_configurado");
    expect(view.customUrl).toBeNull();
    expect(view.defaultUrl).toBe("https://tagigreja.com.br/igreja/igreja-x");
  });
});

describe("runVerificationSweep", () => {
  const pending = (overrides: Partial<PendingDomain> = {}): PendingDomain => ({
    id: CHURCH_ID,
    dominio_customizado: "igrejax.com.br",
    dominio_status: "pendente_dns",
    dominio_solicitado_em: "2026-09-15T00:00:00.000Z",
    ...overrides,
  });

  it("ativa domínio que passou a resolver", async () => {
    const harness = makeHarness({ pending: [pending()], onVerify: async () => ACTIVE });
    const result = await makeService(harness).runVerificationSweep();

    expect(result).toMatchObject({ checked: 1, activated: 1, failed: 0 });
    expect(harness.calls.applied[0].update).toMatchObject({
      status: "ativo",
      verifiedAt: "2026-09-16T12:00:00.000Z",
    });
  });

  it("desiste depois do prazo e explica o que fazer", async () => {
    const harness = makeHarness({
      pending: [pending({ dominio_solicitado_em: "2026-08-01T00:00:00.000Z" })],
    });
    const result = await makeService(harness).runVerificationSweep();

    expect(result).toMatchObject({ activated: 0, failed: 1 });
    expect(harness.calls.applied[0].update.status).toBe("erro");
    expect(harness.calls.applied[0].update.error).toMatch(/DNS/);
  });

  it("uma igreja com erro não interrompe o lote", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outroId = "44444444-4444-4444-8444-444444444444";
    const harness = makeHarness({
      pending: [pending(), pending({ id: outroId, dominio_customizado: "outra.com.br" })],
      onVerify: async (domain) => {
        if (domain === "igrejax.com.br") throw new Error("boom");
        return ACTIVE;
      },
    });

    const result = await makeService(harness).runVerificationSweep();

    expect(result).toMatchObject({ checked: 2, activated: 1, failed: 1 });
    expect(harness.calls.applied.some((c) => c.churchId === outroId)).toBe(true);
    errorSpy.mockRestore();
  });
});

describe("isPastDeadline", () => {
  it("conta a partir da solicitação, e nunca estoura sem data", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    expect(isPastDeadline(null, now)).toBe(false);
    expect(isPastDeadline("2026-09-15T00:00:00.000Z", now)).toBe(false);
    expect(isPastDeadline("2026-08-01T00:00:00.000Z", now)).toBe(true);
  });
});
