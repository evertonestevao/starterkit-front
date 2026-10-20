import { describe, expect, it, vi } from "vitest";
import { createRedePainelService, type RedePainelRepository } from "./redePainelService";

function criar() {
  const repo: RedePainelRepository = {
    temUnidades: vi.fn(async () => true),
    unidades: vi.fn(async () => []),
    semanas: vi.fn(async () => []),
    meses: vi.fn(async () => []),
  };
  return { repo, service: createRedePainelService(repo) };
}

describe("redePainelService", () => {
  it("quem administra carrega o painel inteiro, da empresa dele", async () => {
    const { service, repo } = criar();
    for (const role of ["owner", "admin"] as const) {
      await expect(service.carregar({ companyId: "c1", role })).resolves.toEqual({
        unidades: [],
        semanas: [],
        meses: [],
      });
    }
    expect(repo.unidades).toHaveBeenCalledWith("c1");
    expect(repo.semanas).toHaveBeenCalledWith("c1");
    expect(repo.meses).toHaveBeenCalledWith("c1");
  });

  it("quem não administra é recusado antes de consultar o banco", async () => {
    const { service, repo } = criar();
    await expect(service.carregar({ companyId: "c1", role: "member" })).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.unidades).not.toHaveBeenCalled();
  });

  it("temUnidades: member recebe 'não' sem consulta; admin pergunta ao banco", async () => {
    const { service, repo } = criar();
    expect(await service.temUnidades({ companyId: "c1", role: "member" })).toBe(false);
    expect(repo.temUnidades).not.toHaveBeenCalled();
    expect(await service.temUnidades({ companyId: "c1", role: "admin" })).toBe(true);
  });
});
