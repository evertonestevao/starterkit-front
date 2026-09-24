import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createPlatformSettingsService,
  type PlatformSettingsRepository,
} from "./platformSettingsService";
import type { PlatformSettings } from "@/types/platform";

const ATUAL: PlatformSettings = {
  vagasSede: null,
  vagasSubsede: null,
  vagasCongregacao: null,
  carenciaMarcaDias: 15,
  autopatrocinioAmountCents: 3990,
  updatedAt: "2026-09-20T12:00:00Z",
};

function build() {
  const repo: PlatformSettingsRepository = {
    get: vi.fn(async () => ATUAL),
    update: vi.fn(async () => ATUAL),
    updateAutopatrocinioAmount: vi.fn(async (cents: number) => cents),
  };
  return { repo, service: createPlatformSettingsService(repo) };
}

const base = { vagasSede: "", vagasSubsede: "", vagasCongregacao: "", carenciaMarcaDias: "15" };

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("update", () => {
  it("campo vazio vira ilimitado, e não zero", async () => {
    const { repo, service } = build();

    await service.update(base);

    expect(repo.update).toHaveBeenCalledWith({
      vagasSede: null,
      vagasSubsede: null,
      vagasCongregacao: null,
      carenciaMarcaDias: 15,
    });
  });

  it("zero é um limite de verdade: fecha a igreja para novos", async () => {
    const { repo, service } = build();

    await service.update({ ...base, vagasCongregacao: "0" });

    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ vagasCongregacao: 0 }));
  });

  it("aceita limite por tipo de igreja", async () => {
    const { repo, service } = build();

    await service.update({ ...base, vagasSede: "3", vagasSubsede: "2", vagasCongregacao: "1" });

    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ vagasSede: 3, vagasSubsede: 2, vagasCongregacao: 1 }),
    );
  });

  it("recusa carência negativa, quebrada ou vazia", async () => {
    const { repo, service } = build();

    for (const valor of ["-1", "7,5", "abc", ""]) {
      const err = await erroDe(service.update({ ...base, carenciaMarcaDias: valor }));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("recusa vaga negativa ou fracionada", async () => {
    const { repo, service } = build();

    for (const valor of ["-2", "1.5"]) {
      const err = await erroDe(service.update({ ...base, vagasSubsede: valor }));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe("updateAutopatrocinioAmount", () => {
  it("converte o texto em reais para centavos", async () => {
    const { repo, service } = build();
    await service.updateAutopatrocinioAmount("49,90");
    expect(repo.updateAutopatrocinioAmount).toHaveBeenCalledWith(4990);
  });

  it("recusa valor zero, negativo ou ilegível", async () => {
    const { repo, service } = build();
    for (const ruim of ["0", "-5", "abc", ""]) {
      const err = await erroDe(service.updateAutopatrocinioAmount(ruim));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.updateAutopatrocinioAmount).not.toHaveBeenCalled();
  });
});
