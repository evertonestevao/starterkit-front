import { describe, expect, it, vi } from "vitest";
import { MODELOS_PADRAO } from "@/lib/documentosMembro";
import type { MembroDoDocumento } from "@/types/secretaria";
import {
  canEditarModelos,
  canSecretaria,
  createSecretariaService,
  type SecretariaActor,
  type SecretariaRepository,
} from "./secretariaService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";
const MEMBRO = "33333333-3333-4333-8333-333333333333";
const HOJE = "2026-10-06";

const owner: SecretariaActor = { companyId: "c1", role: "owner", liberado: false };
const secretario: SecretariaActor = { companyId: "c1", role: "member", liberado: true };
const semAcesso: SecretariaActor = { companyId: "c1", role: "member", liberado: false };

const membro: MembroDoDocumento = {
  nome: "Ana Souza",
  sexo: "feminino",
  nascimento: null,
  estadoCivil: null,
  batismo: "2010-08-15",
  membroDesde: "2011-01-09",
  cargos: [],
};

function build(over: Partial<SecretariaRepository> = {}) {
  const repo = {
    getChurch: vi.fn(async () => ({ id: IGREJA, name: "Igreja" })),
    historico: vi.fn(async () => []),
    anotar: vi.fn(async () => "h1"),
    excluirAnotacao: vi.fn(async () => undefined),
    modelosVigentes: vi.fn(async () => []),
    salvarModelo: vi.fn(async () => undefined),
    restaurarModelo: vi.fn(async () => undefined),
    dadosDaIgreja: vi.fn(async () => ({
      nome: "Igreja",
      sobrenome: null,
      endereco: null,
      saudacao: null,
      pastor: "João Pereira",
    })),
    registrarEmissao: vi.fn(async () => undefined),
    ...over,
  } as unknown as SecretariaRepository;
  return { repo, svc: createSecretariaService({ repo, hoje: () => HOJE }) };
}

describe("permissões", () => {
  it("usa quem administra ou tem Membros; o modelo só quem administra", () => {
    expect(canSecretaria("member", true)).toBe(true);
    expect(canSecretaria("member", false)).toBe(false);
    expect(canEditarModelos("admin")).toBe(true);
    expect(canEditarModelos("member")).toBe(false);
  });

  it("sem o módulo nada funciona", async () => {
    const { svc, repo } = build();
    await expect(svc.historico(semAcesso, MEMBRO)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.anotar(semAcesso, MEMBRO, { titulo: "Algo" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.modelos(semAcesso)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.emitir(semAcesso, MEMBRO, membro, { tipo: "declaracao", destino: null })).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(repo.registrarEmissao).not.toHaveBeenCalled();
  });
});

describe("histórico", () => {
  it("anota com título, data e detalhe limpos", async () => {
    const { svc, repo } = build();
    await svc.anotar(secretario, MEMBRO, { titulo: "  Consagrado a diácono ", detalhe: " ", data: "2026-01-10" });
    expect(repo.anotar).toHaveBeenCalledWith(MEMBRO, {
      titulo: "Consagrado a diácono",
      detalhe: null,
      data: "2026-01-10",
    });
  });

  it("recusa título vazio, data no futuro e id malformado", async () => {
    const { svc, repo } = build();
    await expect(svc.anotar(owner, MEMBRO, { titulo: " " })).rejects.toMatchObject({ code: "validation_error" });
    await expect(svc.anotar(owner, MEMBRO, { titulo: "Algo", data: "2026-10-07" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(svc.anotar(owner, "x", { titulo: "Algo" })).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.excluirAnotacao(owner, "x")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.anotar).not.toHaveBeenCalled();
  });
});

describe("modelos", () => {
  const texto = { titulo: "Declaração", corpo: "Declaramos que {nome} é membro da {igreja}." };

  it("a secretaria lê os modelos, mas não altera", async () => {
    const { svc, repo } = build();
    expect((await svc.modelos(secretario)).map((m) => m.origem)).toEqual(["padrao", "padrao", "padrao"]);
    await expect(svc.salvarModelo(secretario, "declaracao", texto)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.restaurarModelo(secretario, "declaracao")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.salvarModelo).not.toHaveBeenCalled();
  });

  it("quem administra salva na própria igreja", async () => {
    const { svc, repo } = build();
    await svc.salvarModelo(owner, "declaracao", texto);
    expect(repo.salvarModelo).toHaveBeenCalledWith(IGREJA, "declaracao", texto.titulo, texto.corpo);
  });

  it("recusa campo desconhecido, texto curto e documento inventado", async () => {
    const { svc, repo } = build();
    const erro = await svc
      .salvarModelo(owner, "declaracao", { ...texto, corpo: "Declaramos que {nomee} é membro daqui." })
      .catch((e) => e);
    expect(erro).toMatchObject({ code: "validation_error" });
    expect(String(erro.message)).toContain("{nomee}");
    await expect(svc.salvarModelo(owner, "declaracao", { titulo: "Ok!", corpo: "curto" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(svc.salvarModelo(owner, "diploma", texto)).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.salvarModelo).not.toHaveBeenCalled();
  });
});

describe("emitir", () => {
  it("monta com o modelo padrão e registra no histórico", async () => {
    const { svc, repo } = build();
    const doc = await svc.emitir(secretario, MEMBRO, membro, { tipo: "declaracao", destino: "Ignorado" });
    expect(doc.titulo).toBe(MODELOS_PADRAO.declaracao.titulo);
    expect(doc.paragrafos[0]).toContain("a irmã Ana Souza");
    expect(doc.pastor).toBe("João Pereira");
    // Declaração não é endereçada: o destino não é guardado.
    expect(repo.registrarEmissao).toHaveBeenCalledWith(MEMBRO, "declaracao", null);
  });

  it("usa o modelo herdado da igreja de cima", async () => {
    const { svc } = build({
      modelosVigentes: vi.fn(async () => [
        {
          tipo: "transferencia" as const,
          titulo: "Carta da Sede",
          corpo: "A sede transfere {nome} para {destino}.",
          origemChurchId: SEDE,
          origemNome: "Sede",
        },
      ]),
    });
    const doc = await svc.emitir(owner, MEMBRO, membro, { tipo: "transferencia", destino: " Igreja de Bauru " });
    expect(doc.titulo).toBe("Carta da Sede");
    expect(doc.paragrafos).toEqual(["A sede transfere Ana Souza para Igreja de Bauru."]);
  });

  it("transferência exige o destino; nada é registrado se falhar", async () => {
    const { svc, repo } = build();
    await expect(svc.emitir(owner, MEMBRO, membro, { tipo: "transferencia", destino: "  " })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(svc.emitir(owner, MEMBRO, membro, { tipo: "diploma", destino: null })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(svc.emitir(owner, "x", membro, { tipo: "declaracao", destino: null })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(repo.registrarEmissao).not.toHaveBeenCalled();
  });

  it("o exemplo não registra nada", async () => {
    const { svc, repo } = build();
    const doc = await svc.exemplo(secretario, "recomendacao");
    expect(doc.paragrafos.join(" ")).toContain("Maria Aparecida de Souza");
    expect(repo.registrarEmissao).not.toHaveBeenCalled();
  });
});
