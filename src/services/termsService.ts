import { AppError } from "@/lib/errors";
import type { ConsentType, TermsAcceptance, TermsVersion } from "@/types/database";

/**
 * Termos de Uso versionados + consentimentos LGPD por finalidade.
 *
 * Há um documento por PÚBLICO: igreja e patrocinador assinam contratos
 * diferentes (a igreja não paga e é controladora dos dados da comunidade; o
 * patrocinador paga, é consumidor e tem direito de arrependimento). Cada
 * público tem sua própria numeração e sua própria versão vigente, e o aceite
 * registra qual documento a pessoa leu.
 *
 * Regras:
 * - O acesso ao dashboard exige aceite da versão VIGENTE (is_current). Se uma
 *   versão nova for publicada, quem aceitou a antiga é forçado a reaceitar.
 * - Consentimentos opcionais (ex.: email) são eventos separados por
 *   finalidade — nunca embutidos no aceite dos termos.
 */

export interface RequestEvidence {
  /** IP e user-agent da request no momento do aceite (evidência LGPD). */
  ipAddress: string | null;
  userAgent: string | null;
}

/** Para quem o documento vale. */
export type TermsAudience = "igreja" | "patrocinador";

export interface TermsRepository {
  getCurrentVersion(audience: TermsAudience): Promise<TermsVersion | null>;
  /** Aceite do usuário logado para a versão dada (RLS restringe ao próprio). */
  findMyAcceptance(termsVersionId: string): Promise<TermsAcceptance | null>;
  insertAcceptance(data: {
    termsVersionId: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
  insertConsent(data: {
    consentType: ConsentType;
    granted: boolean;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
  /** Evento mais recente da finalidade para o usuário logado. */
  getLatestConsent(consentType: ConsentType): Promise<{ granted: boolean } | null>;
}

export function createTermsService(repo: TermsRepository) {
  async function getCurrentTerms(audience: TermsAudience): Promise<TermsVersion | null> {
    return repo.getCurrentVersion(audience);
  }

  /** true se o usuário logado aceitou a versão VIGENTE dos termos. */
  async function hasAcceptedCurrent(audience: TermsAudience): Promise<boolean> {
    const current = await repo.getCurrentVersion(audience);
    if (!current) {
      // Sem versão publicada não há o que aceitar — não bloqueia o sistema.
      return true;
    }
    return (await repo.findMyAcceptance(current.id)) !== null;
  }

  /** Registra o aceite da versão vigente. Idempotente por unique no banco. */
  async function acceptCurrentTerms(
    audience: TermsAudience,
    evidence: RequestEvidence,
  ): Promise<void> {
    const current = await repo.getCurrentVersion(audience);
    if (!current) {
      throw new AppError("not_found", "Nenhuma versão de termos publicada");
    }
    if (await repo.findMyAcceptance(current.id)) {
      return; // já aceitou esta versão
    }
    await repo.insertAcceptance({
      termsVersionId: current.id,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
    });
  }

  /** Grava um evento de consentimento (grant/revoke) da finalidade. */
  async function setConsent(
    consentType: ConsentType,
    granted: boolean,
    evidence: RequestEvidence,
  ): Promise<void> {
    await repo.insertConsent({
      consentType,
      granted,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
    });
  }

  /** Estado atual da finalidade (último evento). Sem evento = não consentiu. */
  async function hasConsent(consentType: ConsentType): Promise<boolean> {
    const latest = await repo.getLatestConsent(consentType);
    return latest?.granted ?? false;
  }

  return { getCurrentTerms, hasAcceptedCurrent, acceptCurrentTerms, setConsent, hasConsent };
}

export type TermsService = ReturnType<typeof createTermsService>;
