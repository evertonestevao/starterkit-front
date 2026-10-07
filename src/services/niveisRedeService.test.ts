import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import { NOMES_PADRAO, type NomesNiveis } from "@/lib/niveisRede";
import { createNiveisRedeService, podeNomearNiveis, type IgrejaDaRede } from "./niveisRedeService";

const SEDE: IgrejaDaRede = { id: "sede-1", tipo: "sede", parentId: null };
const SUBSEDE: IgrejaDaRede = { id: "sub-1", tipo: "subsede", parentId: "sede-1" };
const SOZINHA: IgrejaDaRede = { id: "sub-2", tipo: "subsede", parentId: null };

const FILIAIS = {
  sede: { singular: "Igreja-mãe", plural: "Igrejas-mãe" },
  subsede: { singular: "Filial", plural: "Filiais" },
  congregacao: { singular: "Ponto de pregação", plural: "Pontos de pregação" },
};

function servico(gravado: NomesNiveis | null = null, falha = false) {
  const salvos: Array<{ churchId: string; nomes: NomesNiveis | null }> = [];
  const svc = createNiveisRedeService({
    get: async () => {
      if (falha) throw new Error("banco fora");
      return gravado;
    },
    save: async (churchId, nomes) => {
      salvos.push({ churchId, nomes });
    },
    igrejaDaEmpresa: async () => SEDE,
  });
  return { svc, salvos };
}

describe("podeNomearNiveis", () => {
  it("só o Responsável da sede", () => {
    expect(podeNomearNiveis("owner", SEDE)).toBe(true);
    expect(podeNomearNiveis("admin", SEDE)).toBe(false);
    expect(podeNomearNiveis("member", SEDE)).toBe(false);
    expect(podeNomearNiveis("owner", SUBSEDE)).toBe(false);
    // Igreja cadastrada sozinha (sem superior, mas não é sede) usa o padrão.
    expect(podeNomearNiveis("owner", SOZINHA)).toBe(false);
  });
});

describe("nomesDaRede", () => {
  it("sem nada gravado, sem igreja ou com falha: nomes padrão", async () => {
    await expect(servico().svc.nomesDaRede("sede-1")).resolves.toEqual(NOMES_PADRAO);
    await expect(servico().svc.nomesDaRede(null)).resolves.toEqual(NOMES_PADRAO);
    await expect(servico(null, true).svc.nomesDaRede("sede-1")).resolves.toEqual(NOMES_PADRAO);
  });

  it("devolve os nomes da rede quando há", async () => {
    await expect(servico(FILIAIS).svc.nomesDaRede("sub-1")).resolves.toEqual(FILIAIS);
  });
});

describe("salvar", () => {
  it("grava limpando espaços", async () => {
    const { svc, salvos } = servico();
    await svc.salvar({ role: "owner" }, SEDE, {
      ...FILIAIS,
      congregacao: { singular: "  Ponto   de pregação ", plural: "Pontos de pregação" },
    });
    expect(salvos).toEqual([{ churchId: "sede-1", nomes: FILIAIS }]);
  });

  it("recusa quem não é o Responsável da sede, sem gravar", async () => {
    const { svc, salvos } = servico();
    for (const [role, igreja] of [
      ["admin", SEDE],
      ["owner", SUBSEDE],
      ["owner", SOZINHA],
    ] as const) {
      const err = await svc.salvar({ role }, igreja, FILIAIS).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("forbidden");
    }
    expect(salvos).toEqual([]);
  });

  it("recusa nome curto, longo, com símbolo ou repetido entre níveis", async () => {
    const { svc, salvos } = servico();
    const com = (singular: string) => ({ ...FILIAIS, subsede: { singular, plural: "Filiais" } });
    for (const ruim of [com("F"), com("x".repeat(31)), com("<b>Filial</b>"), com("igreja-mãe"), { sede: FILIAIS.sede }]) {
      const err = await svc.salvar({ role: "owner" }, SEDE, ruim).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(salvos).toEqual([]);
  });
});

describe("restaurarPadrao", () => {
  it("apaga a configuração da rede; só o Responsável da sede", async () => {
    const { svc, salvos } = servico(FILIAIS);
    await svc.restaurarPadrao({ role: "owner" }, SEDE);
    expect(salvos).toEqual([{ churchId: "sede-1", nomes: null }]);
    const err = await svc.restaurarPadrao({ role: "owner" }, SUBSEDE).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("forbidden");
  });
});
