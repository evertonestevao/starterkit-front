import { normalizeReferralCode } from "./referralCookie";

export interface ReferralRepository {
  isValidCode(code: string): Promise<boolean>;
  /** Devolve o id criado, ou null se recusado (auto-indicação, código inválido, já existe). */
  recordCompanyReferral(companyId: string, code: string, userId: string): Promise<string | null>;
}

interface ReferralServiceDeps {
  repo: ReferralRepository;
  now?: () => number;
  /** Suspender vendedor ou desligar o módulo leva até este tempo para valer nos cliques. */
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

/** Regras do clique e da gravação. O cache protege o banco em tráfego de anúncio. */
export function createReferralService({
  repo,
  now = Date.now,
  cacheTtlMs = 60_000,
  maxCacheEntries = 5_000,
}: ReferralServiceDeps) {
  const cache = new Map<string, { valid: boolean; expiresAt: number }>();

  async function isValid(code: string): Promise<boolean> {
    const cached = cache.get(code);
    if (cached && cached.expiresAt > now()) return cached.valid;

    let valid: boolean;
    try {
      valid = await repo.isValidCode(code);
    } catch (err) {
      // Falha do banco não pode quebrar a página de destino do anúncio. Sem cache,
      // para o próximo clique tentar de novo.
      console.error("[resellers] falha ao validar código:", err);
      return false;
    }
    // Códigos aleatórios não podem crescer o cache sem limite.
    if (cache.size >= maxCacheEntries) cache.clear();
    cache.set(code, { valid, expiresAt: now() + cacheTtlMs });
    return valid;
  }

  /**
   * Código a gravar no cookie, ou null para não gravar nada. Vale o primeiro vendedor:
   * cookie existente só é trocado se o código dele deixou de valer.
   */
  async function resolveClick(input: {
    code: string | null | undefined;
    existingCookie: string | null | undefined;
  }): Promise<string | null> {
    const code = normalizeReferralCode(input.code);
    if (!code || !(await isValid(code))) return null;

    const existing = normalizeReferralCode(input.existingCookie);
    if (existing && (await isValid(existing))) return null;

    return code;
  }

  /** Grava o código do cookie no cadastro da empresa recém-criada. */
  async function recordForCompany(input: {
    companyId: string;
    userId: string;
    cookieValue: string | null | undefined;
  }): Promise<string | null> {
    const code = normalizeReferralCode(input.cookieValue);
    if (!code) return null;
    return repo.recordCompanyReferral(input.companyId, code, input.userId);
  }

  return { isValid, resolveClick, recordForCompany };
}

export type ReferralService = ReturnType<typeof createReferralService>;
