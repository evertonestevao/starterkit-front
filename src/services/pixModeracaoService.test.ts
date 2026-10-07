import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import { createPixModeracaoService } from "./pixModeracaoService";

const IGREJA = "11111111-1111-4111-8111-111111111111";

function servico() {
  const decisoes: Array<{ churchId: string; aprovar: boolean; motivo: string | null }> = [];
  const svc = createPixModeracaoService({
    listPendentes: async () => [],
    decidir: async (d) => {
      decisoes.push(d);
    },
  });
  return { svc, decisoes };
}

describe("pixModeracaoService.decidir", () => {
  it("aprovar não leva motivo", async () => {
    const { svc, decisoes } = servico();
    await expect(svc.decidir({ churchId: IGREJA, aprovar: true, motivo: "ignorado" })).resolves.toEqual({ aprovado: true });
    expect(decisoes).toEqual([{ churchId: IGREJA, aprovar: true, motivo: null }]);
  });

  it("recusar exige um motivo que a igreja consiga ler", async () => {
    const { svc, decisoes } = servico();
    for (const motivo of ["", "   ", "não"]) {
      const err = await svc.decidir({ churchId: IGREJA, aprovar: false, motivo }).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    await svc.decidir({ churchId: IGREJA, aprovar: false, motivo: "  Titular não confere com a igreja " });
    expect(decisoes).toEqual([{ churchId: IGREJA, aprovar: false, motivo: "Titular não confere com a igreja" }]);
  });

  it("recusa igreja inválida e motivo longo demais", async () => {
    const { svc, decisoes } = servico();
    for (const ruim of [
      { churchId: "xpto", aprovar: true, motivo: "" },
      { churchId: IGREJA, aprovar: false, motivo: "x".repeat(301) },
    ]) {
      const err = await svc.decidir(ruim).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(decisoes).toEqual([]);
  });
});
