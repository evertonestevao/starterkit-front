import { describe, expect, it, vi } from "vitest";
import { AppError, isAppError } from "@/lib/errors";
import {
  createAssumirService,
  createRedeCadastroService,
  createTrocaDeResponsavelService,
  type AvisosDaTroca,
  podeCadastrarNaRede,
  type ContasDoServidor,
  type RedeCadastroActor,
  type RedeCadastroRepository,
} from "./redeCadastroService";

const MAE = "11111111-1111-4111-8111-111111111111";
const NOVA = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(43);

const ADMIN: RedeCadastroActor = {
  companyId: "33333333-3333-4333-8333-333333333333",
  role: "admin",
  liberado: false,
  userId: "44444444-4444-4444-8444-444444444444",
};

function repo(over: Partial<RedeCadastroRepository> = {}): RedeCadastroRepository {
  return {
    cadastrar: vi.fn(async () => NOVA),
    convidar: vi.fn(async () => "2026-10-16T12:00:00Z"),
    aguardando: vi.fn(async () => []),
    consultarConvite: vi.fn(async () => ({
      estado: "valido" as const,
      igreja: "AD Vila Mariana",
      tipo: "congregacao",
      mae: "AD Ipiranga",
      email: "pastor@igreja.org",
      nome: "Pastor João",
      substituir: false,
    })),
    aceitar: vi.fn(async () => ({
      companyId: "c",
      igreja: "AD Vila Mariana",
      removidos: [],
    })),
    responsaveis: vi.fn(async () => []),
    remover: vi.fn(async () => ({
      email: "velho@igreja.org",
      ficouSemResponsavel: true,
      igreja: "AD Vila Mariana",
    })),
    editar: vi.fn(async () => undefined),
    ...over,
  };
}

function contas(existe = false): ContasDoServidor {
  return {
    contaExiste: vi.fn(async () => existe),
    criarConta: vi.fn(async () => undefined),
    entrar: vi.fn(async () => undefined),
  };
}

async function erroDe(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("permissão", () => {
  it("Responsável e Administrador sempre; os demais só com o cargo liberado", () => {
    expect(podeCadastrarNaRede("owner", false)).toBe(true);
    expect(podeCadastrarNaRede("admin", false)).toBe(true);
    expect(podeCadastrarNaRede("member", true)).toBe(true);
    expect(podeCadastrarNaRede("member", false)).toBe(false);
  });
});

describe("cadastrar", () => {
  const service = (r = repo()) =>
    createRedeCadastroService({
      repo: r,
      tokens: { make: () => TOKEN, hash: () => "h" },
      appUrl: "https://x.test/",
      sufixo: () => "k2",
    });

  it("monta o slug com nome e complemento e tenta de novo se repetir", async () => {
    const cadastrar = vi.fn().mockRejectedValueOnce(new AppError("conflict", "slug")).mockResolvedValueOnce(NOVA);
    const r = repo({ cadastrar });
    expect(
      await service(r).cadastrar(ADMIN, {
        maeId: MAE,
        tipo: "congregacao",
        nome: "AD Ipiranga",
        sobrenome: "Vila Mariana",
      }),
    ).toBe(NOVA);
    expect(cadastrar.mock.calls[0][0]).toMatchObject({
      slug: "ad-ipiranga-vila-mariana",
    });
    expect(cadastrar.mock.calls[1][0]).toMatchObject({
      slug: "ad-ipiranga-vila-mariana-k2",
    });
  });

  it("sem a permissão não cadastra; tipo inventado é recusado antes do banco", async () => {
    const r = repo();
    const sem = await erroDe(
      service(r).cadastrar(
        { ...ADMIN, role: "member" },
        { maeId: MAE, tipo: "congregacao", nome: "X Y", sobrenome: null },
      ),
    );
    expect(isAppError(sem) && sem.code).toBe("forbidden");
    const tipo = await erroDe(
      service(r).cadastrar(ADMIN, {
        maeId: MAE,
        tipo: "sede",
        nome: "X Y",
        sobrenome: null,
      }),
    );
    expect(isAppError(tipo) && tipo.code).toBe("validation_error");
    expect(r.cadastrar).not.toHaveBeenCalled();
  });
});

describe("convidar", () => {
  it("o banco recebe só o hash; o link sai uma vez, com o token", async () => {
    const r = repo();
    const service = createRedeCadastroService({
      repo: r,
      tokens: { make: () => TOKEN, hash: (t) => `hash:${t}` },
      appUrl: "https://www.assembleiaapp.com.br/",
    });
    const res = await service.convidar(ADMIN, {
      churchId: NOVA,
      nome: "Pastor João",
      substituir: false,
      email: " Pastor@Igreja.org ",
      cargo: "pastor",
      whatsapp: "(14) 99999-8888",
    });
    expect(r.convidar).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: `hash:${TOKEN}`,
        email: "pastor@igreja.org",
        whatsapp: "14999998888",
        cargo: "pastor",
      }),
    );
    expect(JSON.stringify(vi.mocked(r.convidar).mock.calls[0][0])).not.toContain(`"${TOKEN}"`);
    expect(res.link).toBe(`https://www.assembleiaapp.com.br/assumir/${TOKEN}`);
  });
});

describe("assumir", () => {
  it("primeiro acesso: cria a conta do e-mail DO CONVITE, entra e assume", async () => {
    const r = repo();
    const c = contas(false);
    await createAssumirService({ repo: r, contas: c }).criarContaEAssumir(TOKEN, {
      nome: "João",
      senha: "Senha-forte-1",
    });
    expect(c.criarConta).toHaveBeenCalledWith({
      email: "pastor@igreja.org",
      senha: "Senha-forte-1",
      nome: "João",
    });
    expect(c.entrar).toHaveBeenCalledWith("pastor@igreja.org", "Senha-forte-1");
    expect(r.aceitar).toHaveBeenCalledWith(TOKEN);
  });

  it("e-mail que já tem conta não ganha conta nova: tem que entrar com a própria senha", async () => {
    const c = contas(true);
    const err = await erroDe(
      createAssumirService({ repo: repo(), contas: c }).criarContaEAssumir(TOKEN, {
        nome: "João",
        senha: "Senha-forte-1",
      }),
    );
    expect(isAppError(err) && err.code).toBe("conflict");
    expect(c.criarConta).not.toHaveBeenCalled();
  });

  it("senha fraca, link vencido e token malformado: nada é criado", async () => {
    const c = contas(false);
    const fraca = await erroDe(
      createAssumirService({ repo: repo(), contas: c }).criarContaEAssumir(TOKEN, { nome: "João", senha: "123" }),
    );
    expect(isAppError(fraca) && fraca.code).toBe("validation_error");
    expect(isAppError(fraca) && fraca.field).toBe("senha");

    const vencido = repo({
      consultarConvite: vi.fn(async () => ({
        estado: "expirado" as const,
        igreja: "X",
        tipo: "congregacao",
        mae: null,
        email: null,
        nome: "J",
        substituir: false,
      })),
    });
    const err = await erroDe(
      createAssumirService({ repo: vencido, contas: c }).criarContaEAssumir(TOKEN, {
        nome: "João",
        senha: "Senha-forte-1",
      }),
    );
    expect(isAppError(err) && err.code).toBe("not_found");

    const mal = await erroDe(
      createAssumirService({ repo: repo(), contas: c }).criarContaEAssumir("../x", {
        nome: "João",
        senha: "Senha-forte-1",
      }),
    );
    expect(isAppError(mal) && mal.code).toBe("not_found");
    expect(c.criarConta).not.toHaveBeenCalled();
  });
});

describe("troca de responsável", () => {
  const OWNER: RedeCadastroActor = { ...ADMIN, role: "owner" };
  const PESSOA = "55555555-5555-4555-8555-555555555555";
  function avisos(): AvisosDaTroca {
    return {
      responsaveisAcima: vi.fn(async () => ["sede@igreja.org"]),
      avisar: vi.fn(async () => undefined),
      enviarRecuperacao: vi.fn(async () => undefined),
    };
  }
  const LISTA = [
    {
      churchId: NOVA,
      igreja: "AD Vila Mariana",
      tipo: "congregacao" as const,
      memberId: PESSOA,
      nome: "Pr. José",
      email: "jose@igreja.org",
      desde: null,
    },
  ];

  it("só o Responsável de cima vê, remove, pede nova senha ou convida substituindo", async () => {
    const r = repo({ responsaveis: vi.fn(async () => LISTA) });
    const a = avisos();
    const troca = createTrocaDeResponsavelService({
      repo: r,
      avisos: a,
      log: { error: vi.fn() },
    });
    expect(await troca.responsaveis(ADMIN, MAE)).toEqual([]);
    expect(r.responsaveis).not.toHaveBeenCalled();
    const rem = await erroDe(troca.remover(ADMIN, PESSOA));
    expect(isAppError(rem) && rem.code).toBe("forbidden");
    expect(r.remover).not.toHaveBeenCalled();
    const e = await erroDe(troca.enviarRecuperacao(ADMIN, MAE, PESSOA));
    expect(isAppError(e) && e.code).toBe("forbidden");
    expect(a.enviarRecuperacao).not.toHaveBeenCalled();

    const conv = await erroDe(
      createRedeCadastroService({
        repo: r,
        tokens: { make: () => TOKEN, hash: () => "h" },
        appUrl: "https://x.test/",
      }).convidar(ADMIN, {
        churchId: NOVA,
        nome: "Pr. Novo",
        email: "novo@igreja.org",
        cargo: "pastor",
        whatsapp: null,
        substituir: true,
      }),
    );
    expect(isAppError(conv) && conv.code).toBe("forbidden");
    expect(r.convidar).not.toHaveBeenCalled();
  });

  it("nova senha só para quem é Responsável de uma igreja abaixo, pelo e-mail dele", async () => {
    const r = repo({ responsaveis: vi.fn(async () => LISTA) });
    const a = avisos();
    const troca = createTrocaDeResponsavelService({ repo: r, avisos: a });
    expect(await troca.enviarRecuperacao(OWNER, MAE, PESSOA)).toBe("jose@igreja.org");
    expect(a.enviarRecuperacao).toHaveBeenCalledWith("jose@igreja.org");
    const fora = await erroDe(troca.enviarRecuperacao(OWNER, MAE, NOVA));
    expect(isAppError(fora) && fora.code).toBe("not_found");
  });

  it("remover avisa quem saiu, e falha no e-mail não desfaz a remoção", async () => {
    const r = repo();
    const a = avisos();
    (a.avisar as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("smtp"));
    const log = { error: vi.fn() };
    const troca = createTrocaDeResponsavelService({ repo: r, avisos: a, log });
    expect(await troca.remover(OWNER, PESSOA)).toEqual({
      ficouSemResponsavel: true,
    });
    expect(r.remover).toHaveBeenCalledWith(PESSOA);
    expect(a.avisar).toHaveBeenCalledWith(expect.objectContaining({ to: ["velho@igreja.org"] }));
    expect(log.error).toHaveBeenCalled();
    const mal = await erroDe(troca.remover(OWNER, "x' or 1=1"));
    expect(isAppError(mal) && mal.code).toBe("not_found");
  });

  it("depois da troca avisa quem saiu e a igreja de cima; sem troca, ninguém", async () => {
    const a = avisos();
    const troca = createTrocaDeResponsavelService({ repo: repo(), avisos: a });
    await troca.avisarTroca(NOVA, { igreja: "AD Vila Mariana", removidos: [] });
    expect(a.avisar).not.toHaveBeenCalled();
    await troca.avisarTroca(NOVA, {
      igreja: "AD Vila Mariana",
      removidos: ["velho@igreja.org"],
    });
    expect(a.avisar).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: ["velho@igreja.org"] }));
    expect(a.avisar).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: ["sede@igreja.org"] }));
  });
});
