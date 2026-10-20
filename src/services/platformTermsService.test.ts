import { describe, expect, it, vi } from "vitest";
import { createPlatformTermsService, type PlatformTermsRepository, type TermosVigentes } from "./platformTermsService";

const corpo = "Cláusula única. ".repeat(20);
const doc = (versao: number, data: string, texto = corpo) =>
  `# Termos de Uso — Igrejas\n\n**Versão ${versao} — vigente desde ${data}**\n\n${texto}`;

const VIGENTE: TermosVigentes = {
  id: "t3",
  version: 3,
  publishedAt: "2026-10-07T12:00:00Z",
  isCurrent: true,
  content: doc(3, "7 de outubro de 2026"),
};

function criar(over: Partial<PlatformTermsRepository> = {}) {
  const repo: PlatformTermsRepository = {
    vigente: vi.fn(async () => VIGENTE),
    historico: vi.fn(async () => [
      { id: "t3", version: 3, publishedAt: VIGENTE.publishedAt, isCurrent: true },
      { id: "t2", version: 2, publishedAt: "2026-09-18T12:00:00Z", isCurrent: false },
    ]),
    publicar: vi.fn(async (_a, _c, versao) => versao),
    ...over,
  };
  return { repo, service: createPlatformTermsService({ repo, hoje: () => "2026-11-02" }) };
}

describe("platformTermsService", () => {
  it("carregar: devolve o vigente e o número da próxima versão", async () => {
    const { service } = criar();
    const r = await service.carregar("igreja");
    expect(r.vigente?.version).toBe(3);
    expect(r.proximaVersao).toBe(4);
  });

  it("publicar: carimba a linha da versão com o próximo número e a data de hoje", async () => {
    const { service, repo } = criar();
    const versao = await service.publicar({
      audience: "igreja",
      content: doc(3, "7 de outubro de 2026", `${corpo}Novo.`),
    });
    expect(versao).toBe(4);
    expect(repo.publicar).toHaveBeenCalledWith("igreja", doc(4, "2 de novembro de 2026", `${corpo}Novo.`), 4);
  });

  it("publicar: o primeiro documento de um público é a versão 1", async () => {
    const { service, repo } = criar({ vigente: vi.fn(async () => null), historico: vi.fn(async () => []) });
    await service.publicar({ audience: "patrocinador", content: doc(9, "x") });
    // O texto vai sem os espaços das pontas.
    expect(repo.publicar).toHaveBeenCalledWith("patrocinador", doc(1, "2 de novembro de 2026").trim(), 1);
  });

  it("publicar: texto igual ao vigente é recusado (não força reaceite à toa)", async () => {
    const { service, repo } = criar();
    await expect(service.publicar({ audience: "igreja", content: `${VIGENTE.content}\n\n` })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repo.publicar).not.toHaveBeenCalled();
  });

  it("publicar: recusa público inexistente e texto curto demais", async () => {
    const { service, repo } = criar();
    await expect(service.publicar({ audience: "todos", content: doc(3, "x") })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(service.publicar({ audience: "igreja", content: "Termos." })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repo.publicar).not.toHaveBeenCalled();
  });
});
