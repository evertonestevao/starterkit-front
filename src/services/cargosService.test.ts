import { describe, expect, it, vi } from "vitest";
import { createCargosService, type CargoRow, type CargosRepository } from "./cargosService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";
const PROPRIO = "33333333-3333-4333-8333-333333333333";
const HERDADO = "44444444-4444-4444-8444-444444444444";
const PADRAO = "55555555-5555-4555-8555-555555555555";

const admin = { companyId: "c1", role: "admin" as const };
const member = { companyId: "c1", role: "member" as const };

function linha(over: Partial<CargoRow>): CargoRow {
  return {
    id: PROPRIO,
    churchId: IGREJA,
    donoNome: "Congregação",
    slug: null,
    nome: "Zelador",
    descricao: null,
    unico: false,
    ordem: 100,
    desativado: false,
    ...over,
  };
}

function build() {
  const repo: CargosRepository = {
    getChurch: vi.fn(async () => ({ id: IGREJA, name: "Congregação" })),
    listVisiveis: vi.fn(async () => [
      linha({}),
      linha({ id: HERDADO, churchId: SEDE, donoNome: "Sede Central", nome: "Coordenador de células" }),
      linha({ id: PADRAO, churchId: null, donoNome: null, slug: "diacono", nome: "Diácono", ordem: 4 }),
    ]),
    create: vi.fn(async () => "novo"),
    update: vi.fn(async () => true),
    pastoresDasIgrejas: vi.fn(async () => ({ [IGREJA]: "Pr. João" })),
    meusCargos: vi.fn(async () => ["Pastor"]),
  };
  return { repo, service: createCargosService(repo) };
}

describe("cargosService", () => {
  it("lista com a origem de cada cargo", async () => {
    const { service } = build();
    const { cargos } = await service.listar(admin);
    expect(cargos.map((c) => [c.nome, c.origem])).toEqual([
      ["Diácono", "plataforma"],
      ["Coordenador de células", "herdado"],
      ["Zelador", "proprio"],
    ]);
  });

  it("member não cria cargo", async () => {
    const { service, repo } = build();
    await expect(service.criar(member, { nome: "Novo", unico: false })).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("cria cargo na igreja ativa", async () => {
    const { service, repo } = build();
    await service.criar(admin, { nome: "Recepcionista", unico: false, descricao: "" });
    expect(repo.create).toHaveBeenCalledWith(IGREJA, {
      nome: "Recepcionista",
      descricao: null,
      unico: false,
      ordem: 100,
    });
  });

  it("não deixa repetir nome já disponível (inclui herdado e padrão, sem acento/caixa)", async () => {
    const { service } = build();
    await expect(service.criar(admin, { nome: "diacono", unico: false })).rejects.toMatchObject({ code: "conflict" });
    await expect(service.criar(admin, { nome: "Coordenador de Células", unico: false })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("edita só o próprio: herdado e padrão são recusados", async () => {
    const { service, repo } = build();
    await service.editar(admin, PROPRIO, { nome: "Zelador(a)", unico: false });
    expect(repo.update).toHaveBeenCalledTimes(1);

    await expect(service.editar(admin, HERDADO, { nome: "X", unico: false })).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringContaining("Sede Central"),
    });
    await expect(service.definirAtivo(admin, PADRAO, false)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it("desativar e reativar o próprio", async () => {
    const { service, repo } = build();
    await service.definirAtivo(admin, PROPRIO, false);
    expect(repo.update).toHaveBeenCalledWith(IGREJA, PROPRIO, { desativado: true });
  });

  it("pastores da rede: só owner/admin; lista vazia não consulta", async () => {
    const { service, repo } = build();
    await expect(service.pastoresDaRede(admin, [IGREJA])).resolves.toEqual({ [IGREJA]: "Pr. João" });
    await expect(service.pastoresDaRede(admin, [])).resolves.toEqual({});
    await expect(service.pastoresDaRede(member, [IGREJA])).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.pastoresDasIgrejas).toHaveBeenCalledTimes(1);
  });
});
