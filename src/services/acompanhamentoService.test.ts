import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import type { FichaMembro, Culto, Justificativa, RolMembro } from "@/types/acompanhamento";
import {
  canAcompanhar,
  createAcompanhamentoService,
  type AcompanhamentoActor,
  type AcompanhamentoRepository,
} from "./acompanhamentoService";

const IGREJA = "11111111-1111-4111-8111-111111111111";
const MEMBRO = "22222222-2222-4222-8222-222222222222";
const ALHEIO = "33333333-3333-4333-8333-333333333333";
const CULTO = "44444444-4444-4444-8444-444444444444";
const JUST = "55555555-5555-4555-8555-555555555555";
// 2026-10-15 é quinta; 2026-10-11 foi domingo.
const HOJE = "2026-10-15";

function culto(over: Partial<Culto> = {}): Culto {
  return {
    id: CULTO,
    churchId: IGREJA,
    nome: "Culto de Domingo",
    tipo: "semanal",
    diaSemana: 0,
    data: null,
    hora: "19:00",
    registraChamada: true,
    removido: false,
    ...over,
  };
}

const owner: AcompanhamentoActor = { companyId: "c1", role: "owner", podeAcompanhar: false };
const secretario: AcompanhamentoActor = { companyId: "c1", role: "member", podeAcompanhar: true };
const member: AcompanhamentoActor = { companyId: "c1", role: "member", podeAcompanhar: false };

const membro: RolMembro = {
  id: MEMBRO,
  churchId: IGREJA,
  nome: "Maria",
  cargos: [],
  whatsapp: null,
  email: null,
  userId: null,
  participaChamada: true,
  membroIgreja: true,
  cuidados: null,
  nascimento: null,
  batismo: null,
  ativo: true,
  situacao: "ativo",
  observacoes: null,
};

function justificativa(over: Partial<Justificativa>): Justificativa {
  return {
    id: JUST,
    membroId: MEMBRO,
    membroNome: "Maria",
    motivo: "viagem",
    motivoTexto: null,
    dataInicio: "2026-10-10",
    dataFim: "2026-10-25",
    encerradaEm: null,
    ...over,
  };
}

function makeRepo(over: Partial<AcompanhamentoRepository> = {}) {
  const chamadas: Record<string, unknown[]> = {};
  const registra =
    (nome: string, retorno?: unknown) =>
    async (...args: unknown[]) => {
      (chamadas[nome] ??= []).push(args);
      return retorno as never;
    };
  const repo = {
    getChurch: async () => ({ id: IGREJA, name: "Igreja Teste" }),
    listMembros: async () => [membro],
    getMembro: async (_c: string, id: string) => (id === MEMBRO ? membro : null),
    getCulto: async (_c: string, id: string) => (id === CULTO ? culto() : null),
    listCultos: async () => [culto()],
    getChamada: async () => null,
    listJustificativas: async () => [],
    salvarChamada: registra("salvarChamada", "chamada-1"),
    createJustificativa: registra("createJustificativa", "j-nova"),
    updateJustificativa: registra("updateJustificativa", true),
    getJustificativa: async () => justificativa({}),
    registrarContato: registra("registrarContato"),
    saveConfig: registra("saveConfig"),
    ...over,
  } as unknown as AcompanhamentoRepository;
  return { repo, chamadas };
}

const service = (over: Partial<AcompanhamentoRepository> = {}) => {
  const { repo, chamadas } = makeRepo(over);
  return { svc: createAcompanhamentoService({ repo, hoje: () => HOJE, horaAgora: () => "10:00" }), chamadas };
};

describe("canAcompanhar", () => {
  it("owner/admin sempre; member só autorizado", () => {
    expect(canAcompanhar("owner", false)).toBe(true);
    expect(canAcompanhar("admin", false)).toBe(true);
    expect(canAcompanhar("member", true)).toBe(true);
    expect(canAcompanhar("member", false)).toBe(false);
  });
});

describe("acompanhamentoService", () => {
  it("member sem autorização não abre nada", async () => {
    const { svc } = service();
    await expect(svc.listMembros(member)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member autorizado (secretário) salva chamada", async () => {
    const { svc, chamadas } = service();
    const id = await svc.salvarChamada(secretario, {
      cultoId: CULTO,
      data: "2026-10-11",
      presencas: [{ membroId: MEMBRO, estado: "justificado", motivo: "saude" }],
      visitantes: [{ nome: "João Visitante", telefone: "" }],
    });
    expect(id).toBe("chamada-1");
    const [args] = chamadas.salvarChamada[0] as [{ presencas: unknown[]; visitantes: unknown[] }];
    expect(args.presencas).toEqual([
      { membroId: MEMBRO, estado: "justificado", justificativaId: null, motivo: "saude", motivoTexto: null },
    ]);
    expect(args.visitantes).toEqual([{ nome: "João Visitante", telefone: null }]);
  });

  it("recusa na chamada alguém que não é do rol desta igreja", async () => {
    const { svc } = service();
    await expect(
      svc.salvarChamada(owner, {
        cultoId: CULTO,
        data: "2026-10-11",
        presencas: [{ membroId: ALHEIO, estado: "presente" }],
        visitantes: [],
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("recusa culto de outra igreja e chamada no futuro", async () => {
    const { svc } = service();
    await expect(
      svc.salvarChamada(owner, { cultoId: ALHEIO, data: "2026-10-11", presencas: [], visitantes: [] }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      svc.salvarChamada(owner, { cultoId: CULTO, data: "2026-10-20", presencas: [], visitantes: [] }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("abrir chamada traz só as justificativas que cobrem a data", async () => {
    const { svc } = service({
      listJustificativas: async () => [justificativa({}), justificativa({ id: "j2", dataInicio: "2026-10-12" })],
    });
    const chamada = await svc.abrirChamada(owner, CULTO, "2026-10-11");
    expect(chamada.justificativas.map((j) => j.id)).toEqual([JUST]);
    expect(chamada.chamadaId).toBeNull();
  });

  it("justificativa: data final antes da inicial é recusada", async () => {
    const { svc } = service();
    await expect(
      svc.salvarJustificativa(owner, null, {
        membroId: MEMBRO,
        motivo: "viagem",
        dataInicio: "2026-10-25",
        dataFim: "2026-10-10",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("justificativa de membro de outra igreja vira not_found", async () => {
    const { svc } = service();
    await expect(
      svc.salvarJustificativa(owner, null, {
        membroId: ALHEIO,
        motivo: "viagem",
        dataInicio: "2026-10-10",
        dataFim: "2026-10-12",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("encerrar antes do prazo: passa a valer até ontem", async () => {
    const { svc, chamadas } = service();
    await svc.encerrarJustificativa(owner, JUST);
    const [, , patch] = chamadas.updateJustificativa[0] as [string, string, Record<string, unknown>];
    expect(patch.dataFim).toBe("2026-10-14");
    expect(patch.encerradaEm).toBeTruthy();
  });

  it("encerrar uma que nem começou: cancela", async () => {
    const { svc, chamadas } = service({
      getJustificativa: async () => justificativa({ dataInicio: "2026-11-01", dataFim: "2026-11-10" }),
    });
    await svc.encerrarJustificativa(owner, JUST);
    const [, , patch] = chamadas.updateJustificativa[0] as [string, string, Record<string, unknown>];
    expect(patch.deletedAt).toBeTruthy();
  });

  it("contato com data futura é recusado", async () => {
    const { svc } = service();
    await expect(
      svc.registrarContato(owner, { membroId: MEMBRO, motivo: "faltas", data: "2026-10-16", resultado: "retornou" }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("regras do alerta: só owner/admin mudam", async () => {
    const { svc, chamadas } = service();
    const config = { faltasAlerta: 3, justificativaLongaCultos: 6, justificativaLongaDias: 45 };
    await expect(svc.salvarConfig(secretario, config)).rejects.toMatchObject({ code: "forbidden" });
    await svc.salvarConfig(owner, config);
    expect(chamadas.saveConfig).toHaveLength(1);
  });

  it("resumo da rede: member não recebe nada", async () => {
    const { svc } = service({ resumoRede: async () => [{ churchId: "x" } as never] });
    expect(await svc.resumoRede(member)).toEqual([]);
    expect(await svc.resumoRede(owner)).toHaveLength(1);
  });

  it("chamada nova só no dia do culto", async () => {
    const { svc } = service();
    // 12/10 foi segunda: o culto é de domingo.
    await expect(svc.abrirChamada(owner, CULTO, "2026-10-12")).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      svc.salvarChamada(owner, { cultoId: CULTO, data: "2026-10-12", presencas: [], visitantes: [] }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("culto sem chamada ou removido da programação não abre chamada nova", async () => {
    for (const over of [{ registraChamada: false }, { removido: true }]) {
      const { svc } = service({ getCulto: async () => culto(over) });
      await expect(svc.abrirChamada(owner, CULTO, "2026-10-11")).rejects.toMatchObject({ code: "validation_error" });
    }
  });

  it("chamada já feita reabre mesmo se o culto saiu da programação", async () => {
    const { svc } = service({
      getCulto: async () => culto({ removido: true }),
      getChamada: async () => ({ chamadaId: "ch-1", presencas: [], visitantes: [] }),
    });
    const chamada = await svc.abrirChamada(owner, CULTO, "2026-10-11");
    expect(chamada.chamadaId).toBe("ch-1");
  });

  it("sugere o último culto quando hoje não tem", async () => {
    const { svc } = service();
    expect(await svc.sugestao(owner)).toMatchObject({ data: "2026-10-11", hoje: false });
  });

  it("lista paginada: tamanho fora das opções volta ao padrão, busca sem acento, página vira deslocamento", async () => {
    const pedidos: unknown[] = [];
    const { svc } = service({
      listMembrosPagina: async (_c, filtro) => {
        pedidos.push(filtro);
        return { items: [membro], total: 45 };
      },
    });

    const r = await svc.listMembrosPaginado(owner, { page: 3, pageSize: 10, busca: "  ANTÔNIO " });
    expect(pedidos[0]).toEqual({ busca: "antonio", situacao: "ativo", cargoId: null, limit: 10, offset: 20 });
    expect(r).toMatchObject({ page: 3, pageSize: 10, total: 45 });

    await svc.listMembrosPaginado(owner, { pageSize: 7, inativos: true });
    expect(pedidos[1]).toEqual({ busca: null, situacao: null, cargoId: null, limit: 20, offset: 0 });
  });

  it("lista paginada exige autorização", async () => {
    const { svc } = service();
    await expect(svc.listMembrosPaginado(member, {})).rejects.toMatchObject({ code: "forbidden" });
  });

  describe("cargos do membro", () => {
    const DIACONO = "77777777-7777-4777-8777-777777777777";
    const VELHO = "88888888-8888-4888-8888-888888888888";
    const OUTRA_REDE = "99999999-9999-4999-8999-999999999999";
    const dados = { nome: "Maria", ativo: true };

    function comCargos() {
      return service({
        listCargosDisponiveis: async () => [{ id: DIACONO, nome: "Diácono", ordem: 4, desativado: false }],
        // Maria já tem um cargo que depois foi desativado.
        getMembro: async () => ({ ...membro, cargos: [{ id: VELHO, nome: "Antigo", ordem: 50, desativado: true }] }),
        setCargosDoMembro: async (...args: unknown[]) => {
          (chamadasCargos ??= []).push(args);
        },
        updateMembro: async () => true,
      });
    }
    let chamadasCargos: unknown[][] | undefined;

    it("dá os cargos disponíveis e mantém o desativado que a pessoa já tinha", async () => {
      chamadasCargos = undefined;
      const { svc } = comCargos();
      await svc.salvarMembro(owner, MEMBRO, dados, [DIACONO, VELHO, DIACONO]);
      expect(chamadasCargos?.[0]).toEqual([IGREJA, MEMBRO, [DIACONO, VELHO]]);
    });

    it("recusa cargo que a igreja não pode usar (outra rede, ou desativado novo)", async () => {
      const { svc } = comCargos();
      await expect(svc.salvarMembro(owner, MEMBRO, dados, [OUTRA_REDE])).rejects.toMatchObject({
        code: "validation_error",
      });
    });

    it("sem a lista de cargos, não mexe neles", async () => {
      chamadasCargos = undefined;
      const { svc } = comCargos();
      await svc.salvarMembro(owner, MEMBRO, dados);
      expect(chamadasCargos).toBeUndefined();
    });
  });

  it("chamada não lista quem não participa (login que só administra)", async () => {
    const admin = { ...membro, id: "99999999-0000-4000-8000-000000000001", nome: "Contador", participaChamada: false };
    const { svc } = service({ listMembros: async () => [membro, admin] });
    const chamada = await svc.abrirChamada(owner, CULTO, "2026-10-11");
    expect(chamada.membros.map((m) => m.nome)).toEqual(["Maria"]);
  });

  it("e-mail do membro é opcional e guardado em minúsculas", async () => {
    const pedidos: unknown[] = [];
    const { svc } = service({
      createMembro: async (_c, dados) => {
        pedidos.push(dados);
        return "novo";
      },
    });
    await svc.salvarMembro(owner, null, { nome: "Ana", ativo: true, email: "Ana@Igreja.org" });
    await svc.salvarMembro(owner, null, { nome: "Bia", ativo: true, email: "" });
    expect(pedidos).toMatchObject([
      { email: "ana@igreja.org", participaChamada: true },
      { email: null },
    ]);
    await expect(svc.salvarMembro(owner, null, { nome: "Cris", ativo: true, email: "sem-arroba" })).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});

describe("excluirMembro", () => {
  it("exclui o cadastro sem login", async () => {
    const { svc, chamadas } = service({
      excluirMembro: async (id) => {
        (chamadas.excluir ??= []).push(id);
      },
    });
    await expect(svc.excluirMembro(owner, MEMBRO)).resolves.toEqual({ nome: membro.nome });
    expect(chamadas.excluir).toEqual([MEMBRO]);
  });

  it("quem tem login não é excluído por aqui: primeiro remove o acesso", async () => {
    const excluidos: string[] = [];
    const { svc } = service({
      getMembro: async () => ({ ...membro, userId: "99999999-9999-4999-8999-999999999999" }),
      excluirMembro: async (id) => {
        excluidos.push(id);
      },
    });
    const err = await svc.excluirMembro(owner, MEMBRO).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("conflict");
    expect(excluidos).toEqual([]);
  });

  it("membro de outra igreja (ou inexistente) é não encontrado", async () => {
    const { svc } = service({ getMembro: async () => null });
    const err = await svc.excluirMembro(owner, MEMBRO).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("not_found");
  });
});

describe("lista, exportação e aniversariantes", () => {
  it("o filtro de situação vai para o repositório; lixo vira só os ativos", async () => {
    const pedidos: unknown[] = [];
    const { svc } = service({
      listMembrosPagina: async (_c, filtro) => {
        pedidos.push(filtro.situacao);
        return { items: [], total: 0 };
      },
    });
    await svc.listMembrosPaginado(owner, { situacao: "transferido" });
    await svc.listMembrosPaginado(owner, { situacao: "todas" });
    await svc.listMembrosPaginado(owner, { situacao: "xpto" });
    expect(pedidos).toEqual(["transferido", null, "ativo"]);
  });

  it("exporta todas as páginas, com os filtros, e só traz fichas quando pedido", async () => {
    const pedidos: Array<{ offset: number; membroIgreja?: boolean; situacao: unknown }> = [];
    let fichasPedidas = 0;
    const { svc } = service({
      listMembrosPagina: async (_c, f) => {
        pedidos.push({ offset: f.offset, membroIgreja: f.membroIgreja, situacao: f.situacao });
        const itens = f.offset === 0 ? Array.from({ length: 500 }, () => membro) : [membro];
        return { items: itens, total: 501 };
      },
      listFichas: async () => {
        fichasPedidas += 1;
        return {};
      },
    });
    const r = await svc.exportarMembros(owner, { situacao: "todas", quadro: "membros" });
    expect(r.membros).toHaveLength(501);
    expect(r.cortado).toBe(false);
    expect(pedidos).toEqual([
      { offset: 0, membroIgreja: true, situacao: null },
      { offset: 500, membroIgreja: true, situacao: null },
    ]);
    expect(fichasPedidas).toBe(0);
    await svc.exportarMembros(owner, { comFichas: true });
    expect(fichasPedidas).toBe(1);
  });

  it("aniversariantes vêm por dia; mês fora de 1 a 12 é recusado", async () => {
    const base = { membroId: MEMBRO, whatsapp: null, tipo: "nascimento" as const, conjugeNome: null };
    const { svc } = service({
      aniversariantes: async () => [
        { ...base, nome: "Zeca", data: "1990-10-20", dia: 20 },
        { ...base, nome: "Ana", data: "1985-10-03", dia: 3 },
      ],
    });
    expect((await svc.aniversariantes(owner, 10)).itens.map((a) => a.nome)).toEqual(["Ana", "Zeca"]);
    const err = await svc.aniversariantes(owner, 13).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
  });
});

describe("ficha do membro", () => {
  const base = { situacao: "ativo" };
  const gravadas = () => {
    const fichas: FichaMembro[] = [];
    const { svc } = service({
      salvarFicha: async (_id, f) => {
        fichas.push(f);
      },
    });
    return { svc, fichas };
  };

  it("quem ainda não tem ficha recebe uma em branco, com a situação do cadastro", async () => {
    const { svc } = service({ getFicha: async () => null });
    const ficha = await svc.getFicha(owner, MEMBRO);
    expect(ficha.situacao).toBe(membro.ativo ? "ativo" : "afastado");
    expect(ficha.cidade).toBeNull();
  });

  it("limpa o CEP, vira null o que veio vazio e guarda o resto", async () => {
    const { svc, fichas } = gravadas();
    await svc.salvarFicha(owner, MEMBRO, {
      ...base,
      cep: "17012-345",
      cidade: "  Bauru ",
      uf: "SP",
      profissao: "",
      estadoCivil: "casado",
      conjugeNome: "Maria",
    });
    expect(fichas[0]).toMatchObject({
      cep: "17012345",
      cidade: "Bauru",
      uf: "SP",
      profissao: null,
      conjugeNome: "Maria",
      situacao: "ativo",
      situacaoEm: null,
    });
  });

  it("sem cônjuge não guarda nome nem data de casamento", async () => {
    const { svc, fichas } = gravadas();
    await svc.salvarFicha(owner, MEMBRO, {
      ...base,
      estadoCivil: "solteiro",
      conjugeNome: "Maria",
      dataCasamento: "2020-05-01",
    });
    expect(fichas[0]).toMatchObject({ conjugeNome: null, dataCasamento: null });
  });

  it("situação diferente de ativo guarda a data de hoje quando não informada; ativo apaga data e motivo", async () => {
    const { svc, fichas } = gravadas();
    await svc.salvarFicha(owner, MEMBRO, { situacao: "transferido", situacaoMotivo: "Mudou de cidade" });
    expect(fichas[0]).toMatchObject({ situacao: "transferido", situacaoEm: HOJE, situacaoMotivo: "Mudou de cidade" });
    await svc.salvarFicha(owner, MEMBRO, { situacao: "ativo", situacaoEm: "2026-01-01", situacaoMotivo: "x" });
    expect(fichas[1]).toMatchObject({ situacao: "ativo", situacaoEm: null, situacaoMotivo: null });
  });

  it("recusa CEP incompleto, UF e situação que não existem e data no futuro", async () => {
    const { svc, fichas } = gravadas();
    for (const ruim of [
      { ...base, cep: "1701" },
      { ...base, uf: "XX" },
      { situacao: "sumido" },
      { ...base, dataConversao: "2999-01-01" },
    ]) {
      const err = await svc.salvarFicha(owner, MEMBRO, ruim).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(fichas).toEqual([]);
  });

  it("membro de outra igreja (ou inexistente) é não encontrado", async () => {
    const { svc } = service({ getMembro: async () => null });
    const err = await svc.salvarFicha(owner, MEMBRO, base).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("not_found");
  });
});

describe("importarMembros", () => {
  type Pessoa = { nome: string; nascimento: string | null; email: string | null };
  const montar = (existentes: Pessoa[] = []) => {
    const gravados: unknown[] = [];
    const { svc } = service({
      listPessoasDoRol: async () => existentes,
      createMembros: async (_c, lista) => {
        gravados.push(...lista);
        return lista.length;
      },
    });
    return { svc, gravados };
  };

  it("grava as linhas boas, já normalizadas", async () => {
    const { svc, gravados } = montar();
    const r = await svc.importarMembros(owner, [
      { nome: "  Ana Lima ", whatsapp: "(11) 98888-7777", email: "ANA@Igreja.org", nascimento: "1980-12-25", batismo: "", observacoes: "" },
      { nome: "Beto" },
    ]);
    expect(r).toEqual({ importados: 2, ignorados: [] });
    expect(gravados).toMatchObject([
      { nome: "Ana Lima", email: "ana@igreja.org", nascimento: "1980-12-25", batismo: null, ativo: true, participaChamada: true },
      { nome: "Beto", whatsapp: null, email: null },
    ]);
  });

  it("homônimos entram: mesmo nome com outra data de nascimento é outra pessoa", async () => {
    const { svc, gravados } = montar([{ nome: "José da Silva", nascimento: "1950-01-10", email: null }]);
    const r = await svc.importarMembros(owner, [
      { nome: "José da Silva", nascimento: "1978-08-22" }, // o filho
      { nome: "José da Silva", nascimento: "2005-03-01" }, // o neto
    ]);
    expect(r).toEqual({ importados: 2, ignorados: [] });
    expect(gravados).toHaveLength(2);
  });

  it("mesmo nome e mesmo nascimento fica de fora, a não ser que a pessoa diga que é outra", async () => {
    const { svc, gravados } = montar([{ nome: "José da Silva", nascimento: "1950-01-10", email: null }]);
    const r = await svc.importarMembros(owner, [
      { nome: "JOSE DA SILVA", nascimento: "1950-01-10" }, // repetido, sem confirmação
      { nome: "Jose da Silva", nascimento: "1950-01-10", outraPessoa: true }, // confirmou que é outro
      { nome: "Carla" },
      { nome: "carla" }, // repetida dentro da planilha, sem data nos dois
    ]);
    expect(r.importados).toBe(2);
    expect(gravados).toMatchObject([{ nome: "Jose da Silva" }, { nome: "Carla" }]);
    expect(r.ignorados).toEqual([
      { nome: "JOSE DA SILVA", motivo: "já cadastrado (mesmo nome e mesma data de nascimento)" },
      { nome: "carla", motivo: "já cadastrado (mesmo nome, sem data de nascimento para diferenciar)" },
    ]);
  });

  it("e-mail já usado nunca entra, nem dizendo que é outra pessoa", async () => {
    const { svc, gravados } = montar([{ nome: "Outra Pessoa", nascimento: null, email: "maria@igreja.org" }]);
    const r = await svc.importarMembros(owner, [{ nome: "Maria Nova", email: "Maria@igreja.org", outraPessoa: true }]);
    expect(r.importados).toBe(0);
    expect(gravados).toEqual([]);
    expect(r.ignorados[0].motivo).toBe("e-mail já usado por outro membro");
  });

  it("valida de novo no servidor: linha ruim não entra, mesmo vinda do navegador", async () => {
    const { svc, gravados } = montar();
    const r = await svc.importarMembros(owner, [{ nome: "A" }, { nome: "Dani", whatsapp: "9999" }, { nome: "Edu", nascimento: "25/12/1980" }]);
    expect(r.importados).toBe(0);
    expect(gravados).toEqual([]);
    expect(r.ignorados.map((i) => i.nome)).toEqual(["A", "Dani", "Edu"]);
  });

  it("recusa planilha vazia ou acima do limite, e quem não pode acompanhar", async () => {
    const { svc } = montar();
    for (const linhas of [[], Array.from({ length: 1001 }, (_, i) => ({ nome: `Pessoa ${i}` }))]) {
      const err = await svc.importarMembros(owner, linhas).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    const semAcesso = await svc
      .importarMembros({ companyId: owner.companyId, role: "member", podeAcompanhar: false }, [{ nome: "Ana" }])
      .catch((e) => e);
    expect(isAppError(semAcesso) && semAcesso.code).toBe("forbidden");
  });
});
