import { describe, expect, it, vi } from "vitest";
import { AppError, isAppError } from "@/lib/errors";
import type { ChurchLeader } from "@/types/churchLeaders";
import {
  canManageLeaders,
  createChurchLeadersService,
  type ChurchLeadersActor,
  type ChurchLeadersRepository,
} from "./churchLeadersService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";
const LIDER = "66666666-6666-4666-8666-666666666666";

const ADMIN: ChurchLeadersActor = { companyId: EMPRESA, role: "admin", userId: "55555555-5555-4555-8555-555555555555" };

function lider(parcial: Partial<ChurchLeader> = {}): ChurchLeader {
  return {
    id: LIDER,
    churchId: IGREJA,
    cargo: "pastor",
    nome: "João Silva",
    email: null,
    telefone: null,
    convidadoEm: null,
    temAcesso: false,
    desde: "2026-09-27",
    ...parcial,
  };
}

function build(over: { existentes?: ChurchLeader[]; inviter?: () => Promise<void> } = {}) {
  const repo: ChurchLeadersRepository = {
    listCompanyChurches: vi.fn(async () => [{ id: IGREJA, name: "Igreja Betel" }]),
    listLeaders: vi.fn(async () => over.existentes ?? []),
    listPastors: vi.fn(async () => ({ [IGREJA]: "João Silva" })),
    create: vi.fn(async (input) => lider({ cargo: input.cargo, nome: input.nome, email: input.email })),
    markInvited: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
  };
  const inviter = vi.fn(over.inviter ?? (async () => undefined));
  const audit = { record: vi.fn(async () => undefined) };
  const log = { error: vi.fn() };
  return { repo, inviter, audit, log, service: createChurchLeadersService({ repo, inviter, audit, log }) };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

const base = { churchId: IGREJA, cargo: "presbitero", nome: "Maria Souza" };

describe("canManageLeaders", () => {
  it("só owner e admin cuidam dos cargos", () => {
    expect(canManageLeaders("owner")).toBe(true);
    expect(canManageLeaders("admin")).toBe(true);
    expect(canManageLeaders("member")).toBe(false);
  });
});

describe("addLeader", () => {
  it("member não registra nem lê cargos", async () => {
    const { service, repo } = build();
    const member = { ...ADMIN, role: "member" as const };

    const err = await erroDe(service.addLeader(member, base));
    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(isAppError(await erroDe(service.listByCompany(member)))).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("registra só a identificação, sem convite, quando não se pede acesso", async () => {
    const { service, repo, inviter } = build();

    await expect(service.addLeader(ADMIN, { ...base, email: "maria@igreja.org" })).resolves.toEqual({ invited: false });

    expect(repo.create).toHaveBeenCalledWith({
      churchId: IGREJA,
      cargo: "presbitero",
      nome: "Maria Souza",
      email: "maria@igreja.org",
      telefone: null,
    });
    expect(inviter).not.toHaveBeenCalled();
  });

  it("e-mail e telefone são opcionais: campo vazio do formulário vira ausente", async () => {
    const { service, repo } = build();

    await service.addLeader(ADMIN, { ...base, email: "", telefone: "  ", convidarComo: "" });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ email: null, telefone: null }));
  });

  it("convida a pessoa com o papel escolhido e marca o convite como enviado", async () => {
    const { service, repo, inviter } = build();

    const result = await service.addLeader(ADMIN, { ...base, email: "Maria@Igreja.org", convidarComo: "admin" });

    expect(result).toEqual({ invited: true });
    expect(inviter).toHaveBeenCalledWith({
      companyId: EMPRESA,
      email: "maria@igreja.org",
      role: "admin",
      invitedBy: ADMIN.userId,
    });
    expect(repo.markInvited).toHaveBeenCalledWith({ leaderId: LIDER, churchId: IGREJA });
  });

  it("não convida sem e-mail", async () => {
    const { service, repo } = build();

    const err = await erroDe(service.addLeader(ADMIN, { ...base, convidarComo: "member" }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("owner não é um papel convidável", async () => {
    const { service } = build();
    const err = await erroDe(service.addLeader(ADMIN, { ...base, email: "maria@igreja.org", convidarComo: "owner" }));
    expect(isAppError(err) && err.code).toBe("validation_error");
  });

  it("se o convite falha, o cargo continua registrado e a mensagem diz o que fazer", async () => {
    const { service, repo, log } = build({
      inviter: async () => {
        throw new AppError("email_error", "detalhe interno do provedor");
      },
    });

    const err = await erroDe(service.addLeader(ADMIN, { ...base, email: "maria@igreja.org", convidarComo: "member" }));

    expect(repo.create).toHaveBeenCalled();
    expect(isAppError(err) && err.message).toContain("Cargo registrado, mas o convite não foi enviado");
    expect(isAppError(err) && err.message).not.toContain("provedor");
    expect(repo.markInvited).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it("limite de convites atingido é dito como tal", async () => {
    const { service } = build({
      inviter: async () => {
        throw new AppError("rate_limited", "x");
      },
    });

    const err = await erroDe(service.addLeader(ADMIN, { ...base, email: "maria@igreja.org", convidarComo: "member" }));

    expect(isAppError(err) && err.code).toBe("rate_limited");
  });

  it("uma igreja tem um Pastor por vez", async () => {
    const { service, repo } = build({ existentes: [lider()] });

    const err = await erroDe(service.addLeader(ADMIN, { ...base, cargo: "pastor", nome: "Pedro Lima" }));

    expect(isAppError(err) && err.code).toBe("conflict");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("os outros cargos aceitam várias pessoas", async () => {
    const { service, repo } = build({ existentes: [lider({ cargo: "diacono" })] });

    await service.addLeader(ADMIN, { ...base, cargo: "diacono", nome: "Outro Diácono" });

    expect(repo.create).toHaveBeenCalled();
  });

  it("recusa cargo fora do catálogo", async () => {
    const { service } = build();
    const err = await erroDe(service.addLeader(ADMIN, { ...base, cargo: "bispo" }));
    expect(isAppError(err) && err.code).toBe("validation_error");
  });

  it("recusa igreja de outra empresa", async () => {
    const { service, repo } = build();

    const err = await erroDe(service.addLeader(ADMIN, { ...base, churchId: OUTRA }));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("registra na auditoria só o cargo — sem nome, e-mail nem telefone", async () => {
    const { service, audit } = build();

    await service.addLeader(ADMIN, { ...base, email: "maria@igreja.org", telefone: "11999990000" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "church.leader.added", metadata: { cargo: "presbitero", convidado: false } }),
    );
  });
});

describe("removeLeader", () => {
  it("tira a pessoa do cargo e audita", async () => {
    const { service, repo, audit } = build();

    await service.removeLeader(ADMIN, { churchId: IGREJA, leaderId: LIDER });

    expect(repo.remove).toHaveBeenCalledWith({ leaderId: LIDER, churchId: IGREJA });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "church.leader.removed" }));
  });

  it("não remove registro de igreja de outra empresa", async () => {
    const { service, repo } = build();
    const err = await erroDe(service.removeLeader(ADMIN, { churchId: OUTRA, leaderId: LIDER }));
    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it("registro inexistente é not_found", async () => {
    const { service, repo } = build();
    vi.mocked(repo.remove).mockResolvedValueOnce(false);
    const err = await erroDe(service.removeLeader(ADMIN, { churchId: IGREJA, leaderId: LIDER }));
    expect(isAppError(err) && err.code).toBe("not_found");
  });
});

describe("listByCompany e pastorsOf", () => {
  it("lista as igrejas da empresa com o Pastor primeiro", async () => {
    const { service } = build({
      existentes: [
        lider({ id: "a", cargo: "secretario", nome: "Ana" }),
        lider({ id: "b", cargo: "pastor", nome: "Zé" }),
        lider({ id: "c", cargo: "diacono", nome: "Bia" }),
      ],
    });

    const [igreja] = await service.listByCompany(ADMIN);

    expect(igreja.leaders.map((l) => l.cargo)).toEqual(["pastor", "diacono", "secretario"]);
  });

  it("devolve os pastores das igrejas pedidas; lista vazia não consulta o banco", async () => {
    const { service, repo } = build();

    await expect(service.pastorsOf(ADMIN, [IGREJA])).resolves.toEqual({ [IGREJA]: "João Silva" });
    await expect(service.pastorsOf(ADMIN, [])).resolves.toEqual({});
    expect(repo.listPastors).toHaveBeenCalledTimes(1);
  });

  it("member não lê pastores da rede", async () => {
    const { service } = build();
    const err = await erroDe(service.pastorsOf({ ...ADMIN, role: "member" }, [IGREJA]));
    expect(isAppError(err) && err.code).toBe("forbidden");
  });
});
