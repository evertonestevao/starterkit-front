import { AppError, isAppError } from "@/lib/errors";
import { parseBrlToCents } from "@/lib/churchEvents";
import { normalizeTiers, type PriceTier } from "./sponsorPricing";

/**
 * Preço de patrocínio (por posição), editável pela moderação da plataforma.
 * `sponsor_price_tiers` é pública para leitura — quem lê aqui é a tela de
 * `/plataforma/configuracoes`, que já sabe que é platform_staff; a barreira
 * de verdade é a RPC de escrita, que confere `is_platform_staff()` de novo.
 */

export interface PlatformPricingRepository {
  getTiers(): Promise<PriceTier[]>;
  /** Substitui a tabela inteira (é isso que a RPC faz, atomicamente). */
  updateTiers(tiers: PriceTier[]): Promise<PriceTier[]>;
}

/** Uma posição, ainda como texto de formulário. */
export interface RawTierInput {
  position: number;
  /** "39,90", "R$ 39,90"... o que a pessoa digitou. */
  amountRaw: string;
}

function parseAmount(input: RawTierInput): PriceTier {
  const cents = parseBrlToCents(input.amountRaw);
  if (cents === null || cents <= 0) {
    throw new AppError(
      "validation_error",
      `O valor da ${input.position}ª posição precisa ser maior que zero.`,
    );
  }
  return { position: input.position, amountCents: cents };
}

export function createPlatformPricingService(repo: PlatformPricingRepository) {
  return {
    getTiers(): Promise<PriceTier[]> {
      return repo.getTiers();
    },

    async updateTiers(input: RawTierInput[]): Promise<PriceTier[]> {
      if (input.length === 0) {
        throw new AppError("validation_error", "Informe ao menos uma posição.");
      }
      const tiers = input.map(parseAmount);
      let normalized: PriceTier[];
      try {
        normalized = normalizeTiers(tiers);
      } catch (err) {
        // normalizeTiers lança internal_error (é pensada para tabela já
        // salva); aqui a posição fora de ordem é a própria pessoa editando.
        throw isAppError(err) ? new AppError("validation_error", err.message) : err;
      }
      return repo.updateTiers(normalized);
    },
  };
}

export type PlatformPricingService = ReturnType<typeof createPlatformPricingService>;
