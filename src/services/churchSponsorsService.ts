import { AppError } from "@/lib/errors";
import type { SponsorshipStatus } from "@/types/sponsorship";

/**
 * Quem patrocina a igreja, do ponto de vista da IGREJA.
 *
 * Só o que ela deve saber: nome, logo, desde quando e situação. Sem CPF,
 * sem contato e sem valor — o dinheiro custeia a plataforma e não é
 * repassado à igreja, então exibir cifra aqui criaria expectativa errada.
 */

export interface CompanySponsor {
  sponsorshipId: string;
  churchId: string;
  churchName: string;
  sponsorName: string;
  logoUrl: string | null;
  status: Extract<SponsorshipStatus, "active" | "cancel_scheduled">;
  activatedAt: string | null;
  endsAt: string | null;
  /** Escondido pela igreja: some da página pública, mas segue pagando. */
  hiddenAt: string | null;
  denunciaAberta: boolean;
  /**
   * Fora da vitrine por atraso além da carência. Diferente de `hiddenAt`:
   * ninguém da igreja escondeu — a marca volta sozinha quando o patrocinador
   * pagar.
   */
  emCarencia: boolean;
}

export interface CompanySponsorsRepository {
  listByCompany(companyId: string): Promise<CompanySponsor[]>;
  setHidden(input: { sponsorshipId: string; hidden: boolean; reason: string | null }): Promise<void>;
  reportAbuse(input: { sponsorshipId: string; motivo: string }): Promise<string>;
  /** Quantas igrejas escondem esse mesmo patrocinador hoje. */
  countHidesForSponsorOf(sponsorshipId: string): Promise<number>;
}

export interface ChurchSponsorNotifier {
  sendStaffAlert(input: { subject: string; lines: string[] }): Promise<void>;
}

export interface CompanySponsorsSummary {
  sponsors: CompanySponsor[];
  activeCount: number;
  /** Cancelaram, mas seguem exibidos até o fim do ciclo pago. */
  leavingCount: number;
  /** Quantas igrejas da empresa têm ao menos um patrocinador. */
  churchesWithSponsors: number;
  /** Escondidos pela igreja — continuam na conta, fora da página. */
  hiddenCount: number;
}

interface Deps {
  repo: CompanySponsorsRepository;
  notifier: ChurchSponsorNotifier;
  appUrl: string;
}

/**
 * Duas saídas para a igreja que não quer aquela marca na página dela:
 *
 * - esconder é decisão SÓ dela, imediata, sem passar por ninguém, e não mexe
 *   na cobrança do patrocinador;
 * - denunciar é o contrário: manda o caso para a plataforma olhar.
 *
 * Esconder não vira alerta sozinho — gosto de igreja é gosto. O sinal para a
 * moderação é o MESMO patrocinador escondido por mais de uma igreja, que
 * aparece antes de alguém se dar ao trabalho de denunciar.
 */
export function createChurchSponsorsService({ repo, notifier, appUrl }: Deps) {
  const base = appUrl.replace(/\/+$/, "");

  return {
    async getSummary(companyId: string): Promise<CompanySponsorsSummary> {
      if (!companyId) {
        throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      }
      const sponsors = await repo.listByCompany(companyId);

      return {
        sponsors,
        // Quem está escondido não conta como "aparece na página".
        activeCount: sponsors.filter((s) => s.status === "active" && !s.hiddenAt).length,
        leavingCount: sponsors.filter((s) => s.status === "cancel_scheduled" && !s.hiddenAt).length,
        churchesWithSponsors: new Set(
          sponsors.filter((s) => !s.hiddenAt).map((s) => s.churchId),
        ).size,
        hiddenCount: sponsors.filter((s) => s.hiddenAt).length,
      };
    },

    async setHidden(input: { sponsorshipId: string; hidden: boolean; reason?: string | null }) {
      const sponsorshipId = String(input.sponsorshipId ?? "").trim();
      if (!sponsorshipId) throw new AppError("validation_error", "Patrocínio inválido");

      await repo.setHidden({
        sponsorshipId,
        hidden: input.hidden,
        reason: input.reason?.trim() || null,
      });

      if (!input.hidden) return;

      const igrejas = await repo.countHidesForSponsorOf(sponsorshipId);
      if (igrejas > 1) {
        await notifier.sendStaffAlert({
          subject: "Patrocinador escondido por mais de uma igreja",
          lines: [
            `Um patrocinador já está escondido por ${igrejas} igrejas.`,
            "Uma igreja esconder é gosto; várias esconderem a mesma marca costuma ser problema.",
            `${base}/plataforma/denuncias`,
          ],
        });
      }
    },

    async reportAbuse(input: { sponsorshipId: string; motivo: string }) {
      const sponsorshipId = String(input.sponsorshipId ?? "").trim();
      const motivo = String(input.motivo ?? "").trim();
      if (!sponsorshipId) throw new AppError("validation_error", "Patrocínio inválido");
      if (motivo.length < 5) {
        throw new AppError("validation_error", "Conte o que houve, com pelo menos algumas palavras.");
      }
      if (motivo.length > 1000) {
        throw new AppError("validation_error", "Motivo muito longo.");
      }

      await repo.reportAbuse({ sponsorshipId, motivo });
      await notifier.sendStaffAlert({
        subject: "Nova denúncia de patrocinador",
        lines: [`Motivo relatado pela igreja: ${motivo}`, `${base}/plataforma/denuncias`],
      });
    },
  };
}

export type ChurchSponsorsService = ReturnType<typeof createChurchSponsorsService>;
