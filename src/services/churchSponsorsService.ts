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
}

export interface CompanySponsorsRepository {
  listByCompany(companyId: string): Promise<CompanySponsor[]>;
}

export interface CompanySponsorsSummary {
  sponsors: CompanySponsor[];
  activeCount: number;
  /** Cancelaram, mas seguem exibidos até o fim do ciclo pago. */
  leavingCount: number;
  /** Quantas igrejas da empresa têm ao menos um patrocinador. */
  churchesWithSponsors: number;
}

export function createChurchSponsorsService(repo: CompanySponsorsRepository) {
  return {
    async getSummary(companyId: string): Promise<CompanySponsorsSummary> {
      if (!companyId) {
        throw new AppError("unauthorized", "Selecione uma empresa para continuar.");
      }
      const sponsors = await repo.listByCompany(companyId);

      return {
        sponsors,
        activeCount: sponsors.filter((s) => s.status === "active").length,
        leavingCount: sponsors.filter((s) => s.status === "cancel_scheduled").length,
        churchesWithSponsors: new Set(sponsors.map((s) => s.churchId)).size,
      };
    },
  };
}

export type ChurchSponsorsService = ReturnType<typeof createChurchSponsorsService>;
