import { describe, expect, it, vi } from "vitest";
import type { EbdAluno, EbdClasse } from "@/types/ebd";
import { canAcessarEbd, canGerirEbd, createEbdService, type EbdActor, type EbdRepository } from "./ebdService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const CLASSE = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const ALUNO = "44444444-4444-4444-8444-444444444444";
const ESTRANHO = "55555555-5555-4555-8555-555555555555";
const HOJE = "2026-10-01";

const owner: EbdActor = { companyId: "c1", role: "owner", podeGerirEbd: false, professorEbd: false };
const secretaria: EbdActor = { companyId: "c1", role: "member", podeGerirEbd: true, professorEbd: false };
const professor: EbdActor = { companyId: "c1", role: "member", podeGerirEbd: false, professorEbd: true };
const member: EbdActor = { companyId: "c1", role: "member", podeGerirEbd: false, professorEbd: false };

const classe: EbdClasse = {
  id: CLASSE,
  nome: "Juniores",
  faixaEtaria: null,
  sala: null,
  ordem: 1,
  ativa: true,
  idadeMinima: 9,
  idadeMaxima: 11,
  matriculados: 1,
  professores: [],
};
const aluno: EbdAluno = {
  membroId: ALUNO,
  matriculaId: "m1",
  nome: "Davi",
  whatsapp: null,
  nascimento: null,
  membroIgreja: false,
  desde: "2026-09-01",
  cuidados: null,
};

function build(over: Partial<EbdRepository> = {}) {
  const repo = {
    getChurch: vi.fn(async () => ({ id: IGREJA, name: "Igreja" })),
    listClasses: vi.fn(async () => [classe]),
    criarClasse: vi.fn(async () => "nova"),
    alunos: vi.fn(async () => [aluno]),
    getAula: vi.fn(async () => null),
    licaoDoDia: vi.fn(async () => null),
    salvarAula: vi.fn(async () => "aula"),
    matricular: vi.fn(async () => undefined),
    matricularNovo: vi.fn(async () => "novo"),
    ...over,
  } as unknown as EbdRepository;
  return { repo, svc: createEbdService({ repo, hoje: () => HOJE }) };
}

const aulaBase = {
  classeId: CLASSE,
  data: "2026-09-27",
  licao: "",
  biblias: 3,
  revistas: 2,
  ofertaCentavos: 1250,
  presencas: [{ membroId: ALUNO, estado: "presente" }],
  visitantes: [{ nome: "Visitante", telefone: "" }],
};

describe("permissões da EBD", () => {
  it("gestão: owner/admin ou secretaria; acesso: gestão ou professor", () => {
    expect(canGerirEbd("owner", false)).toBe(true);
    expect(canGerirEbd("member", true)).toBe(true);
    expect(canGerirEbd("member", false)).toBe(false);
    expect(canAcessarEbd(professor)).toBe(true);
    expect(canAcessarEbd(member)).toBe(false);
  });

  it("member sem nada não abre a EBD", async () => {
    const { svc } = build();
    await expect(svc.classes(member)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("professor não cria classe nem matricula quem já está no rol", async () => {
    const { svc, repo } = build();
    await expect(svc.criarClasse(professor, { nome: "Nova" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.matricular(professor, CLASSE, ALUNO)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.criarClasse).not.toHaveBeenCalled();
  });

  it("professor matricula aluno novo na classe dele; a secretaria cria classe", async () => {
    const { svc, repo } = build();
    await svc.matricularNovo(professor, { classeId: CLASSE, nome: "Ana Júlia", nascimento: "2017-03-10" });
    expect(repo.matricularNovo).toHaveBeenCalledWith(
      expect.objectContaining({ classeId: CLASSE, nome: "Ana Júlia", telefone: null, visitanteId: null }),
    );
    await svc.criarClasse(secretaria, { nome: "Jovens", faixaEtaria: "" });
    expect(repo.criarClasse).toHaveBeenCalledWith(IGREJA, {
      nome: "Jovens",
      faixaEtaria: null,
      sala: null,
      ordem: 100,
      idadeMinima: null,
      idadeMaxima: null,
    });
  });
});

describe("chamada da EBD", () => {
  it("salva com contagem e visitante", async () => {
    const { svc, repo } = build();
    await svc.salvarAula(owner, aulaBase);
    expect(repo.salvarAula).toHaveBeenCalledWith(
      expect.objectContaining({
        ofertaCentavos: 1250,
        licao: null,
        visitantes: [{ nome: "Visitante", telefone: null, membroId: null }],
      }),
    );
  });

  it("recusa aluno não matriculado, classe que não é dela e data futura", async () => {
    const { svc } = build();
    await expect(
      svc.salvarAula(owner, { ...aulaBase, presencas: [{ membroId: ESTRANHO, estado: "presente" }] }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(svc.salvarAula(owner, { ...aulaBase, classeId: OUTRA })).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.salvarAula(owner, { ...aulaBase, data: "2026-10-05" })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("oferta negativa é recusada", async () => {
    const { svc } = build();
    await expect(svc.salvarAula(owner, { ...aulaBase, ofertaCentavos: -1 })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("abrir aula nova traz os alunos sem presença salva", async () => {
    const { svc } = build();
    const aula = await svc.abrirAula(professor, CLASSE, "2026-09-27");
    expect(aula).toMatchObject({ aulaId: null, alunos: [aluno], presencas: {}, ofertaCentavos: 0 });
  });
});

describe("ficha do membro", () => {
  it("quem nunca participou não mostra a EBD", async () => {
    const vazio = {
      classeAtual: null,
      desde: null,
      presencas: 0,
      ausencias: 0,
      justificados: 0,
      ultimaPresenca: null,
      classesAnteriores: null,
    };
    const { svc } = build({ resumoDoMembro: async () => vazio });
    expect(await svc.resumoDoMembro(ALUNO)).toBeNull();
    const { svc: comClasse } = build({ resumoDoMembro: async () => ({ ...vazio, classeAtual: "Juniores" }) });
    expect(await comClasse.resumoDoMembro(ALUNO)).toMatchObject({ classeAtual: "Juniores" });
  });
});

describe("etapa 2", () => {
  const t4 = { id: "66666666-6666-4666-8666-666666666666", nome: "4º", inicio: "2026-10-01", fim: "2026-12-31", revista: null };

  it("trimestre: só a gestão cria, e não pode sobrepor outro", async () => {
    const salvar = vi.fn(async () => undefined);
    const { svc } = build({ listTrimestres: async () => [t4], salvarTrimestre: salvar });
    const novo = { nome: "1º de 2027", inicio: "2027-01-01", fim: "2027-03-31" };
    await expect(svc.salvarTrimestre(professor, null, novo)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      svc.salvarTrimestre(secretaria, null, { ...novo, inicio: "2026-12-15" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await svc.salvarTrimestre(secretaria, null, novo);
    expect(salvar).toHaveBeenCalledWith(IGREJA, null, { ...novo, revista: null });
    // Editar o próprio trimestre não conta como sobreposição consigo mesmo.
    await svc.salvarTrimestre(secretaria, t4.id, { nome: "4º", inicio: "2026-10-01", fim: "2026-12-20" });
  });

  it("contato: classe que a pessoa enxerga e data não futura", async () => {
    const registrar = vi.fn(async () => undefined);
    const { svc } = build({ registrarContato: registrar });
    const base = { membroId: ALUNO, classeId: CLASSE, data: "2026-09-30", resultado: "retornou" };
    await svc.registrarContato(professor, base);
    expect(registrar).toHaveBeenCalledWith(IGREJA, { ...base, observacao: null });
    await expect(svc.registrarContato(professor, { ...base, classeId: OUTRA })).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.registrarContato(professor, { ...base, data: "2026-10-02" })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("regra de faltas: só a gestão, entre 1 e 20", async () => {
    const salvar = vi.fn(async () => undefined);
    const { svc } = build({ saveFaltasAlerta: salvar });
    await expect(svc.salvarFaltasAlerta(professor, 4)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.salvarFaltasAlerta(owner, 0)).rejects.toMatchObject({ code: "validation_error" });
    await svc.salvarFaltasAlerta(owner, 4);
    expect(salvar).toHaveBeenCalledWith(IGREJA, 4);
  });

  it("relatório: período válido e classe opcional", async () => {
    const freq = vi.fn(async () => []);
    const { svc } = build({ relatorioClasses: async () => [], frequenciaAlunos: freq, presencaPorDomingo: async () => [] });
    await expect(svc.relatorio(owner, { de: "2026-10-10", ate: "2026-10-01" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await svc.relatorio(owner, { de: "2026-07-01", ate: "2026-09-30", classeId: "lixo" });
    expect(freq).toHaveBeenCalledWith(IGREJA, null, "2026-07-01", "2026-09-30");
  });
});

describe("etapa 3", () => {
  it("classe: idade máxima não pode ser menor que a mínima", async () => {
    const { svc } = build();
    await expect(svc.criarClasse(owner, { nome: "X", idadeMinima: "10", idadeMaxima: "8" })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("responsável: precisa de nome ou de alguém de Membros", async () => {
    const salvar = vi.fn(async () => undefined);
    const { svc } = build({ salvarResponsavel: salvar });
    await expect(svc.salvarResponsavel({ membroId: ALUNO, parentesco: "Mãe" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await svc.salvarResponsavel({ membroId: ALUNO, nome: "Maria", telefone: "", parentesco: "Mãe" });
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, nome: "Maria", telefone: null, responsavelId: null, podeBuscar: true }),
    );
  });

  it("promoção: só a gestão e só para classe ativa", async () => {
    const promover = vi.fn(async () => 1);
    const { svc } = build({ promover });
    const input = { data: "2027-01-03", itens: [{ membroId: ALUNO, classeId: CLASSE }] };
    await expect(svc.promover(professor, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      svc.promover(owner, { ...input, itens: [{ membroId: ALUNO, classeId: OUTRA }] }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await svc.promover(owner, input)).toBe(1);
  });

  it("lições: uma por domingo, sem repetir as que já existem", async () => {
    const criar = vi.fn(async () => undefined);
    const trimestre = { id: "77777777-7777-4777-8777-777777777777", nome: "4º", inicio: "2026-10-01", fim: "2026-12-31", revista: null };
    const { svc } = build({
      listTrimestres: async () => [trimestre],
      licoes: async () => [{ id: "l1", trimestreId: trimestre.id, numero: 1, data: "2026-10-04", titulo: null, tituloGeral: null }],
      criarLicoes: criar,
    });
    expect(await svc.gerarLicoes(owner, trimestre.id)).toBe(12);
    const [, , novas] = criar.mock.calls[0] as unknown as [string, string, Array<{ numero: number; data: string }>];
    expect(novas[0]).toEqual({ numero: 2, data: "2026-10-11" });
  });

  it("chamada nova já vem com a lição do domingo; reaberta mantém a salva", async () => {
    const licao = { id: "l3", trimestreId: "t", numero: 3, data: "2026-09-27", titulo: "A fé de Abraão", tituloGeral: "A fé de Abraão" };
    const { svc } = build({ licaoDoDia: async () => licao });
    expect((await svc.abrirAula(owner, CLASSE, "2026-09-27")).licao).toBe("Lição 3 — A fé de Abraão");
    const { svc: reaberta } = build({
      licaoDoDia: async () => licao,
      getAula: async () => ({ aulaId: "a", licao: null, biblias: 0, revistas: 0, ofertaCentavos: 0, presencas: {}, visitantes: [] }),
    });
    expect((await reaberta.abrirAula(owner, CLASSE, "2026-09-27")).licao).toBeNull();
  });
});

describe("rede e títulos por classe", () => {
  it("chamada usa o título da classe; sem ele, o geral", async () => {
    const base = { id: "l5", trimestreId: "t", numero: 5, data: "2026-09-27", tituloGeral: "Geral" };
    const pedidos: unknown[] = [];
    const { svc } = build({
      licaoDoDia: async (_c, _d, classeId) => {
        pedidos.push(classeId);
        return { ...base, titulo: "Revista Juniores" };
      },
    });
    expect((await svc.abrirAula(owner, CLASSE, "2026-09-27")).licao).toBe("Lição 5 — Revista Juniores");
    expect(pedidos).toEqual([CLASSE]);
    const { svc: semTitulo } = build({ licaoDoDia: async () => ({ ...base, titulo: null }) });
    expect((await semTitulo.abrirAula(owner, CLASSE, "2026-09-27")).licao).toBe("Lição 5 — Geral");
  });

  it("título por classe: só a gestão e só classe que ela enxerga", async () => {
    const salvar = vi.fn(async () => true);
    const { svc } = build({ salvarTituloLicao: salvar });
    const LICAO = "88888888-8888-4888-8888-888888888888";
    await expect(svc.salvarTituloLicao(professor, LICAO, "x", CLASSE)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.salvarTituloLicao(owner, LICAO, "x", OUTRA)).rejects.toMatchObject({ code: "not_found" });
    await svc.salvarTituloLicao(owner, LICAO, "  ", CLASSE);
    expect(salvar).toHaveBeenCalledWith(IGREJA, LICAO, null, CLASSE);
  });

  it("números da rede: gestão recebe; professor, vazio", async () => {
    const rede = vi.fn(async () => [{ churchId: "x" }]);
    const { svc } = build({ resumoRede: rede as unknown as EbdRepository["resumoRede"] });
    expect(await svc.resumoRede(professor)).toEqual([]);
    expect(await svc.resumoRede(secretaria)).toHaveLength(1);
  });
});

