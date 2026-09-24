import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { PriceTier } from "./sponsorPricing";
import { createPlatformPricingService, type PlatformPricingRepository } from "./platformPricingService";

const TIERS: PriceTier[] = [
  { position: 1, amountCents: 3990 },
  { position: 2, amountCents: 3490 },
];

function build() {
  const repo: PlatformPricingRepository = {
    getTiers: vi.fn(async () => TIERS),
    updateTiers: vi.fn(async (tiers) => tiers),
  };
  return { repo, service: createPlatformPricingService(repo) };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("getTiers", () => {
  it("devolve a tabela do repositório", async () => {
    const { service } = build();
    expect(await service.getTiers()).toEqual(TIERS);
  });
});

describe("updateTiers", () => {
  it("converte o texto em reais para centavos e salva ordenado", async () => {
    const { repo, service } = build();

    await service.updateTiers([
      { position: 1, amountRaw: "49,90" },
      { position: 2, amountRaw: "R$ 44,90" },
    ]);

    expect(repo.updateTiers).toHaveBeenCalledWith([
      { position: 1, amountCents: 4990 },
      { position: 2, amountCents: 4490 },
    ]);
  });

  it("aceita uma posição só", async () => {
    const { repo, service } = build();
    await service.updateTiers([{ position: 1, amountRaw: "39,90" }]);
    expect(repo.updateTiers).toHaveBeenCalledWith([{ position: 1, amountCents: 3990 }]);
  });

  it("recusa lista vazia", async () => {
    const { repo, service } = build();
    const err = await erroDe(service.updateTiers([]));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.updateTiers).not.toHaveBeenCalled();
  });

  it("recusa valor zero, negativo ou ilegível, dizendo qual posição", async () => {
    const { repo, service } = build();

    for (const ruim of ["0", "-5", "abc", ""]) {
      const err = await erroDe(
        service.updateTiers([
          { position: 1, amountRaw: "39,90" },
          { position: 2, amountRaw: ruim },
        ]),
      );
      expect(isAppError(err) && err.code).toBe("validation_error");
      expect(isAppError(err) && err.message).toMatch(/2ª posição/);
    }
    expect(repo.updateTiers).not.toHaveBeenCalled();
  });

  it("recusa posição fora de ordem antes de salvar", async () => {
    const { repo, service } = build();

    const err = await erroDe(
      service.updateTiers([
        { position: 1, amountRaw: "39,90" },
        { position: 3, amountRaw: "29,90" },
      ]),
    );

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.updateTiers).not.toHaveBeenCalled();
  });
});
