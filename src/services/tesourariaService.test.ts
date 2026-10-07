import { describe, expect, it, vi } from "vitest";
import {
  canTesouraria,
  createTesourariaService,
  type TesourariaActor,
  type TesourariaRepository,
} from "./tesourariaService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const MEMBRO = "22222222-2222-4222-8222-222222222222";
const CULTO = "33333333-3333-4333-8333-333333333333";
const LANC = "44444444-4444-4444-8444-444444444444";
const HOJE = "2026-10-06";

const owner: TesourariaActor = { companyId: "c1", role: "owner", liberado: false };
const tesoureiro: TesourariaActor = { companyId: "c1", role: "member", liberado: true };
const membro: TesourariaActor = { companyId: "c1", role: "member", liberado: false };

function build(over: Partial<TesourariaRepository> = {}) {
  const repo = {
    getChurch: vi.fn(async () => ({ id: IGREJA, name: "Igreja" })),
    listar: vi.fn(async () => []),
    salvar: vi.fn(async () => LANC),
    excluir: vi.fn(async () => undefined),
    cultos: vi.fn(async () => []),
    buscarPessoas: vi.fn(async () => [{ id: MEMBRO, nome: "Ana Souza" }]),
    ...over,
  } as unknown as TesourariaRepository;
  return { repo, svc: createTesourariaService({ repo, hoje: () => HOJE }) };
}

const dizimo = {
  data: "2026-10-04",
  scheduleId: CULTO,
  tipo: "dizimo",
  valorCentavos: 15000,
  forma: "pix",
  membroId: MEMBRO,
  nome: "Ana Souza",
  observacao: "  ",
};

describe("canTesouraria", () => {
  it("quem administra ou tem o módulo liberado", () => {
    expect(canTesouraria("owner", false)).toBe(true);
    expect(canTesouraria("admin", false)).toBe(true);
    expect(canTesouraria("member", true)).toBe(true);
    expect(canTesouraria("member", false)).toBe(false);
  });
});

describe("tesourariaService", () => {
  it("sem o módulo, nada funciona — e o banco nem é consultado", async () => {
    const { svc, repo } = build();
    await expect(svc.doMes(membro, "2026-10")).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.salvar(membro, null, dizimo)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.excluir(membro, LANC)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.buscarPessoas(membro, "ana")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.getChurch).not.toHaveBeenCalled();
  });

  it("lista o mês inteiro da igreja ativa", async () => {
    const { svc, repo } = build();
    await svc.doMes(tesoureiro, "2026-02");
    expect(repo.listar).toHaveBeenCalledWith(IGREJA, "2026-02-01", "2026-02-28");
    await expect(svc.doMes(owner, "2026-2")).rejects.toMatchObject({ code: "validation_error" });
  });

  it("salva o dízimo com a pessoa, limpando texto vazio", async () => {
    const { svc, repo } = build();
    await svc.salvar(tesoureiro, null, dizimo);
    expect(repo.salvar).toHaveBeenCalledWith(IGREJA, null, { ...dizimo, observacao: null });
  });

  it("oferta não guarda nome nem pessoa", async () => {
    const { svc, repo } = build();
    await svc.salvar(owner, LANC, { ...dizimo, tipo: "oferta" });
    expect(repo.salvar).toHaveBeenCalledWith(
      IGREJA,
      LANC,
      expect.objectContaining({ tipo: "oferta", membroId: null, nome: null }),
    );
  });

  it("recusa valor zero, negativo, quebrado ou absurdo", async () => {
    const { svc, repo } = build();
    for (const valorCentavos of [0, -100, 10.5, 100_000_001]) {
      await expect(svc.salvar(owner, null, { ...dizimo, valorCentavos })).rejects.toMatchObject({
        code: "validation_error",
      });
    }
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("recusa data no futuro, tipo e forma desconhecidos e ids malformados", async () => {
    const { svc, repo } = build();
    const ruins = [
      { ...dizimo, data: "2026-10-07" },
      { ...dizimo, data: "07/10/2026" },
      { ...dizimo, tipo: "saida" },
      { ...dizimo, forma: "cheque" },
      { ...dizimo, membroId: "1 or 1=1" },
      { ...dizimo, scheduleId: "x" },
      { ...dizimo, nome: "A" },
    ];
    for (const ruim of ruins) {
      await expect(svc.salvar(owner, null, ruim)).rejects.toMatchObject({ code: "validation_error" });
    }
    await expect(svc.salvar(owner, "nao-e-uuid", dizimo)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.excluir(owner, "nao-e-uuid")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(repo.excluir).not.toHaveBeenCalled();
  });

  it("a busca de nomes só vai ao banco com 2 letras ou mais", async () => {
    const { svc, repo } = build();
    expect(await svc.buscarPessoas(tesoureiro, " a ")).toEqual([]);
    expect(await svc.buscarPessoas(tesoureiro, 42)).toEqual([]);
    expect(repo.buscarPessoas).not.toHaveBeenCalled();
    expect(await svc.buscarPessoas(tesoureiro, " ana ")).toHaveLength(1);
    expect(repo.buscarPessoas).toHaveBeenCalledWith(IGREJA, "ana");
  });
});
