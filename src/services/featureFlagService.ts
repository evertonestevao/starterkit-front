import type { BillingService } from "./billingService";

/**
 * Feature flags simples por plano/empresa/usuário (plano §10) — função de
 * checagem, sem painel. Sem tabela nova: o default vem das features do plano
 * efetivo (billingService) e overrides ficam em settings com chaves:
 *
 *   feature:<key>                 override da empresa inteira
 *   feature:<key>:user:<userId>   override para um usuário na empresa
 *
 * Precedência: usuário > empresa > plano. Override só vale se for boolean —
 * valor de outro tipo é ignorado (configuração corrompida não abre feature).
 */

export interface SettingsReader {
  /** Valor da configuração ativa (deleted_at null), ou undefined se ausente. */
  getValue(companyId: string, key: string): Promise<unknown>;
}

interface FeatureFlagDeps {
  settings: SettingsReader;
  billing: Pick<BillingService, "canAccessFeature">;
}

export function createFeatureFlagService({ settings, billing }: FeatureFlagDeps) {
  async function isEnabled(
    companyId: string,
    featureKey: string,
    userId?: string,
  ): Promise<boolean> {
    if (userId) {
      const userOverride = await settings.getValue(
        companyId,
        `feature:${featureKey}:user:${userId}`,
      );
      if (typeof userOverride === "boolean") return userOverride;
    }

    const companyOverride = await settings.getValue(companyId, `feature:${featureKey}`);
    if (typeof companyOverride === "boolean") return companyOverride;

    return billing.canAccessFeature(companyId, featureKey);
  }

  return { isEnabled };
}

export type FeatureFlagService = ReturnType<typeof createFeatureFlagService>;
