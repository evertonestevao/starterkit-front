import { describe, expect, it } from "vitest";
import type { TermsAcceptance, TermsVersion } from "@/types/database";
import { createTermsService, type TermsRepository } from "./termsService";

function makeVersion(overrides: Partial<TermsVersion>): TermsVersion {
  return {
    id: "v1-id",
    version: 1,
    content: "conteúdo",
    published_at: "2026-01-01T00:00:00Z",
    is_current: true,
    ...overrides,
  };
}

/** Repo em memória: 1 usuário implícito (RLS faria isso no real). */
function makeRepo(state: {
  current: TermsVersion | null;
  acceptances?: string[]; // ids de versão já aceitas
  consents?: Array<{ consent_type: string; granted: boolean }>;
}): TermsRepository {
  state.acceptances ??= [];
  state.consents ??= [];
  return {
    async getCurrentVersion() {
      return state.current;
    },
    async findMyAcceptance(termsVersionId) {
      return state.acceptances!.includes(termsVersionId)
        ? ({ terms_version_id: termsVersionId } as TermsAcceptance)
        : null;
    },
    async insertAcceptance({ termsVersionId }) {
      state.acceptances!.push(termsVersionId);
    },
    async insertConsent({ consentType, granted }) {
      state.consents!.push({ consent_type: consentType, granted });
    },
    async getLatestConsent(consentType) {
      const events = state.consents!.filter((c) => c.consent_type === consentType);
      return events.length ? { granted: events[events.length - 1].granted } : null;
    },
  };
}

describe("termsService.hasAcceptedCurrent", () => {
  it("sem versão publicada não bloqueia o sistema", async () => {
    const service = createTermsService(makeRepo({ current: null }));
    expect(await service.hasAcceptedCurrent()).toBe(true);
  });

  it("false quando nunca aceitou; true depois de aceitar", async () => {
    const state = { current: makeVersion({}), acceptances: [] as string[] };
    const service = createTermsService(makeRepo(state));
    expect(await service.hasAcceptedCurrent()).toBe(false);

    await service.acceptCurrentTerms({ ipAddress: "1.2.3.4", userAgent: "test" });
    expect(await service.hasAcceptedCurrent()).toBe(true);
  });

  it("cenário do spec: versão nova publicada força reaceite de quem aceitou a antiga", async () => {
    // usuário aceitou a v1...
    const state = {
      current: makeVersion({ id: "v1-id", version: 1 }) as TermsVersion | null,
      acceptances: ["v1-id"],
    };
    const service = createTermsService(makeRepo(state));
    expect(await service.hasAcceptedCurrent()).toBe(true);

    // ...v2 vira a vigente: acesso volta a ser bloqueado até reaceitar
    state.current = makeVersion({ id: "v2-id", version: 2 });
    expect(await service.hasAcceptedCurrent()).toBe(false);

    await service.acceptCurrentTerms({ ipAddress: null, userAgent: null });
    expect(await service.hasAcceptedCurrent()).toBe(true);
    expect(state.acceptances).toEqual(["v1-id", "v2-id"]); // trilha preservada
  });
});

describe("termsService.acceptCurrentTerms", () => {
  it("falha sem versão publicada e é idempotente para a mesma versão", async () => {
    const noVersion = createTermsService(makeRepo({ current: null }));
    await expect(
      noVersion.acceptCurrentTerms({ ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ code: "not_found" });

    const state = { current: makeVersion({}), acceptances: [] as string[] };
    const service = createTermsService(makeRepo(state));
    await service.acceptCurrentTerms({ ipAddress: null, userAgent: null });
    await service.acceptCurrentTerms({ ipAddress: null, userAgent: null });
    expect(state.acceptances).toEqual(["v1-id"]); // não duplica
  });
});

describe("termsService consentimentos (separados por finalidade)", () => {
  it("consentimento de email é independente do aceite dos termos", async () => {
    const state = { current: makeVersion({}), acceptances: [] as string[], consents: [] };
    const service = createTermsService(makeRepo(state));

    await service.acceptCurrentTerms({ ipAddress: null, userAgent: null });
    // aceitou os termos mas NÃO consentiu email
    expect(await service.hasConsent("email_communications")).toBe(false);
  });

  it("estado atual é o último evento: grant e depois revoke", async () => {
    const service = createTermsService(makeRepo({ current: makeVersion({}) }));
    const evidence = { ipAddress: "1.2.3.4", userAgent: "test" };

    await service.setConsent("email_communications", true, evidence);
    expect(await service.hasConsent("email_communications")).toBe(true);

    await service.setConsent("email_communications", false, evidence);
    expect(await service.hasConsent("email_communications")).toBe(false);
  });
});
