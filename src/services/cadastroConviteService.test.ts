import { describe, expect, it, vi } from "vitest";
import { createCadastroConviteService, type CadastroConviteRepository } from "./cadastroConviteService";

function build() {
  const repo: CadastroConviteRepository = {
    cadastroAberto: vi.fn(async () => false),
    definirCadastroAberto: vi.fn(async () => undefined),
    criarConvite: vi.fn(async () => "2026-10-16T12:00:00Z"),
    listarConvites: vi.fn(async () => []),
    revogarConvite: vi.fn(async () => undefined),
  };
  const svc = createCadastroConviteService({
    repo,
    tokens: { make: () => "tok", hash: (t) => `hash-${t}` },
    appUrl: "https://app.test/",
  });
  return { repo, svc };
}

describe("cadastro por convite", () => {
  it("gera o link uma vez e grava só o hash", async () => {
    const { repo, svc } = build();
    const r = await svc.gerarConvite({ descricao: " Pr. João ", validadeDias: "7" });
    expect(r.link).toBe("https://app.test/nova-igreja/tok");
    expect(repo.criarConvite).toHaveBeenCalledWith({ tokenHash: "hash-tok", descricao: "Pr. João", validadeDias: 7 });
  });

  it("recusa descrição vazia e validade fora de 1 a 30 dias", async () => {
    const { repo, svc } = build();
    await expect(svc.gerarConvite({ descricao: "", validadeDias: 7 })).rejects.toMatchObject({ code: "validation_error" });
    await expect(svc.gerarConvite({ descricao: "Ok", validadeDias: 90 })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repo.criarConvite).not.toHaveBeenCalled();
  });

  it("cancelar com id inválido não chega ao banco", async () => {
    const { repo, svc } = build();
    await expect(svc.revogarConvite("1 or 1=1")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.revogarConvite).not.toHaveBeenCalled();
  });
});
