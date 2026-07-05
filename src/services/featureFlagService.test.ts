import { describe, expect, it } from "vitest";
import { createFeatureFlagService, type SettingsReader } from "./featureFlagService";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeSettings(values: Record<string, unknown>): SettingsReader {
  return {
    async getValue(_companyId, key) {
      return values[key];
    },
  };
}

function makeBilling(planFeatures: Record<string, boolean>) {
  return {
    async canAccessFeature(_companyId: string, featureKey: string) {
      return planFeatures[featureKey] ?? false;
    },
  };
}

describe("featureFlagService.isEnabled", () => {
  it("usa a feature do plano quando não há override", async () => {
    const service = createFeatureFlagService({
      settings: makeSettings({}),
      billing: makeBilling({ reports: true }),
    });
    expect(await service.isEnabled(COMPANY_ID, "reports")).toBe(true);
    expect(await service.isEnabled(COMPANY_ID, "sso")).toBe(false);
  });

  it("override de empresa vence o plano", async () => {
    const service = createFeatureFlagService({
      settings: makeSettings({ "feature:reports": false, "feature:beta": true }),
      billing: makeBilling({ reports: true, beta: false }),
    });
    expect(await service.isEnabled(COMPANY_ID, "reports")).toBe(false);
    expect(await service.isEnabled(COMPANY_ID, "beta")).toBe(true);
  });

  it("override de usuário vence empresa e plano", async () => {
    const service = createFeatureFlagService({
      settings: makeSettings({
        "feature:beta": false,
        [`feature:beta:user:${USER_ID}`]: true,
      }),
      billing: makeBilling({ beta: false }),
    });
    expect(await service.isEnabled(COMPANY_ID, "beta", USER_ID)).toBe(true);
    // outro usuário sem override cai no override da empresa
    expect(await service.isEnabled(COMPANY_ID, "beta", "33333333-3333-4333-8333-333333333333")).toBe(false);
  });

  it("ignora override que não é boolean (configuração corrompida não abre feature)", async () => {
    const service = createFeatureFlagService({
      settings: makeSettings({ "feature:reports": "sim" }),
      billing: makeBilling({ reports: false }),
    });
    expect(await service.isEnabled(COMPANY_ID, "reports")).toBe(false);
  });
});
