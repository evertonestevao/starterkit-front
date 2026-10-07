import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import { SAUDACAO_PADRAO } from "@/lib/saudacao";
import { createSaudacaoService } from "./saudacaoService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const admin = { companyId: "c1", role: "admin" as const };

function servico(gravada: string | null = null, opcoes: { falha?: boolean; alheia?: boolean } = {}) {
  const salvos: Array<{ companyId: string; churchId: string; saudacao: string | null }> = [];
  const svc = createSaudacaoService({
    get: async () => {
      if (opcoes.falha) throw new Error("banco fora");
      return { churchId: IGREJA, saudacao: gravada };
    },
    save: async (companyId, churchId, saudacao) => {
      if (opcoes.alheia) return false;
      salvos.push({ companyId, churchId, saudacao });
      return true;
    },
  });
  return { svc, salvos };
}

describe("daEmpresa", () => {
  it("devolve a gravada; sem nada gravado ou com falha, o padrão", async () => {
    expect((await servico("Graça e paz").svc.daEmpresa("c1")).saudacao).toBe("Graça e paz");
    expect((await servico(null).svc.daEmpresa("c1")).saudacao).toBe(SAUDACAO_PADRAO);
    expect((await servico(null, { falha: true }).svc.daEmpresa("c1")).saudacao).toBe(SAUDACAO_PADRAO);
  });
});

describe("salvar", () => {
  it("grava limpando espaços e a pontuação do fim", async () => {
    const { svc, salvos } = servico();
    await expect(svc.salvar(admin, IGREJA, "  Graça   e paz! ")).resolves.toBe("Graça e paz");
    expect(salvos).toEqual([{ companyId: "c1", churchId: IGREJA, saudacao: "Graça e paz" }]);
  });

  it("vazio ou igual ao padrão volta ao padrão (grava null)", async () => {
    const { svc, salvos } = servico("Graça e paz");
    await expect(svc.salvar(admin, IGREJA, "   ")).resolves.toBe(SAUDACAO_PADRAO);
    await expect(svc.salvar(admin, IGREJA, `${SAUDACAO_PADRAO}!`)).resolves.toBe(SAUDACAO_PADRAO);
    expect(salvos.map((s) => s.saudacao)).toEqual([null, null]);
  });

  it("member não altera", async () => {
    const { svc, salvos } = servico();
    const err = await svc.salvar({ companyId: "c1", role: "member" }, IGREJA, "Olá").catch((e) => e);
    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(salvos).toEqual([]);
  });

  it("recusa texto curto, longo ou com símbolos", async () => {
    const { svc, salvos } = servico();
    for (const ruim of ["A", "x".repeat(41), "<b>Oi</b>", "Olá 😀", "veja http://x.com/a"]) {
      const err = await svc.salvar(admin, IGREJA, ruim).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(salvos).toEqual([]);
  });

  it("igreja de outra empresa é não encontrada", async () => {
    const { svc } = servico(null, { alheia: true });
    const err = await svc.salvar(admin, IGREJA, "Olá").catch((e) => e);
    expect(isAppError(err) && err.code).toBe("not_found");
  });
});
