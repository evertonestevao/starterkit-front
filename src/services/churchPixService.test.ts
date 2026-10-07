import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createChurchPixService,
  detectPixKeyKind,
  maskPixKey,
  type ChurchPixRepository,
  type PixActor,
  type PixNotifier,
} from "./churchPixService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";

const ADMIN: PixActor = {
  companyId: EMPRESA,
  role: "admin",
  userId: "55555555-5555-4555-8555-555555555555",
  email: "pastor@igreja.org",
};

const TOKEN = "t".repeat(43);

function build(status: "aprovado" | "aguardando" = "aprovado") {
  const repo: ChurchPixRepository = {
    listCompanyChurches: vi.fn(async () => [
      {
        id: IGREJA,
        name: "Igreja Betel",
        pixChave: "antiga@chave.org",
        pixTitular: "Igreja Betel",
        pixStatus: status,
        pixMotivoRecusa: null,
      },
    ]),
    updatePix: vi.fn(async () => undefined),
    listCompanyAdminEmails: vi.fn(async () => ["pastor@igreja.org", "tesoureiro@igreja.org"]),
    criarConfirmacao: vi.fn(async () => ["responsavel@igreja.org"]),
    confirmacaoPorToken: vi.fn(async () => ({
      estado: "valido" as const,
      churchName: "Igreja Betel",
      chave: "igreja@exemplo.org",
      titular: "Igreja Betel",
    })),
    confirmarPorToken: vi.fn(async () => ({ churchName: "Igreja Betel", publicCode: "betel" })),
  };
  const notifier = {
    sendPixChanged: vi.fn(async () => undefined),
    sendPixConfirmation: vi.fn<PixNotifier["sendPixConfirmation"]>(async () => undefined),
  };
  const tokens = { make: vi.fn(() => TOKEN), hash: vi.fn((t: string) => `hash(${t})`) };
  const audit = { record: vi.fn(async () => undefined) };
  const log = { error: vi.fn() };
  return { repo, notifier, audit, service: createChurchPixService({ repo, notifier, audit, tokens, log }), log };
}

const base = { churchId: IGREJA, chave: "igreja@exemplo.org", titular: "Igreja Betel", confirmado: true };

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("detectPixKeyKind", () => {
  it("reconhece os cinco tipos de chave", () => {
    expect(detectPixKeyKind("529.982.247-25")).toBe("cpf");
    expect(detectPixKeyKind("11.222.333/0001-81")).toBe("cnpj");
    expect(detectPixKeyKind("igreja@exemplo.org")).toBe("email");
    expect(detectPixKeyKind("+5514999998888")).toBe("telefone");
    expect(detectPixKeyKind("123e4567-e89b-12d3-a456-426614174000")).toBe("aleatoria");
  });

  it("recusa o que não é chave", () => {
    expect(detectPixKeyKind("minha chave")).toBeNull();
    expect(detectPixKeyKind("1234")).toBeNull();
  });
});

describe("maskPixKey", () => {
  it("mostra só as pontas: o email de aviso não carrega a chave inteira", () => {
    expect(maskPixKey("igreja@exemplo.org")).toBe("igr***org");
    expect(maskPixKey("abc")).toBe("a***");
  });
});

describe("savePix", () => {
  it("grava, registra na trilha e avisa todos os administradores", async () => {
    const { repo, notifier, audit, service } = build();

    await service.savePix(ADMIN, base);

    expect(repo.updatePix).toHaveBeenCalledWith({
      churchId: IGREJA,
      companyId: EMPRESA,
      chave: "igreja@exemplo.org",
      titular: "Igreja Betel",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "church.pix.updated",
        metadata: expect.objectContaining({ chave_nova: "igr***org", chave_anterior: "ant***org" }),
      }),
    );
    expect(notifier.sendPixChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["pastor@igreja.org", "tesoureiro@igreja.org"],
        chaveMascarada: "igr***org",
        alteradoPor: "pastor@igreja.org",
      }),
    );
  });

  it("member não troca a chave por onde o dinheiro entra", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.savePix({ ...ADMIN, role: "member" }, base));

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.updatePix).not.toHaveBeenCalled();
  });

  it("sem a confirmação da tela, não grava", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.savePix(ADMIN, { ...base, confirmado: false }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.updatePix).not.toHaveBeenCalled();
  });

  it("recusa chave em formato que nenhum banco aceita", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.savePix(ADMIN, { ...base, chave: "pix da igreja" }));

    expect(isAppError(err) && err.message).toMatch(/Chave PIX inválida/);
    expect(repo.updatePix).not.toHaveBeenCalled();
  });

  it("igreja de outra empresa não é encontrada", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.savePix(ADMIN, { ...base, churchId: OUTRA }));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.updatePix).not.toHaveBeenCalled();
  });

  it("falha no email não desfaz a troca já gravada", async () => {
    const { repo, notifier, service, log } = build();
    notifier.sendPixChanged.mockRejectedValueOnce(new Error("smtp fora"));

    await service.savePix(ADMIN, base);

    expect(repo.updatePix).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });
});

describe("confirmação por e-mail", () => {
  it("salvar manda o link ao Responsável, guardando só o hash do token", async () => {
    const { service, repo, notifier } = build();
    const r = await service.savePix(ADMIN, base);
    expect(r.confirmacaoEnviada).toBe(true);
    expect(repo.criarConfirmacao).toHaveBeenCalledWith({
      churchId: IGREJA,
      tokenHash: `hash(${TOKEN})`,
      solicitadoPor: ADMIN.userId,
      validadeHoras: 48,
    });
    const enviado = notifier.sendPixConfirmation.mock.calls[0]![0];
    expect(enviado.to).toEqual(["responsavel@igreja.org"]);
    expect(enviado.token).toBe(TOKEN);
    // No e-mail a chave vai mascarada.
    expect(enviado.chaveMascarada).not.toContain("igreja@exemplo.org");
  });

  it("falha no e-mail não desfaz o salvar: a tela oferece reenviar", async () => {
    const { service, repo, notifier } = build();
    notifier.sendPixConfirmation.mockRejectedValueOnce(new Error("smtp fora"));
    expect((await service.savePix(ADMIN, base)).confirmacaoEnviada).toBe(false);
    expect(repo.updatePix).toHaveBeenCalled();
  });

  it("sem Responsável com e-mail, avisa que não enviou", async () => {
    const { service, repo } = build();
    vi.mocked(repo.criarConfirmacao).mockResolvedValueOnce([]);
    expect((await service.savePix(ADMIN, base)).confirmacaoEnviada).toBe(false);
  });

  it("reenviar só vale para chave aguardando, e só para quem administra", async () => {
    const aprovada = build("aprovado");
    expect(isAppError(await erroDe(aprovada.service.reenviarConfirmacao(ADMIN, IGREJA)))).toBe(true);
    expect(aprovada.repo.criarConfirmacao).not.toHaveBeenCalled();

    const aguardando = build("aguardando");
    await aguardando.service.reenviarConfirmacao(ADMIN, IGREJA);
    expect(aguardando.notifier.sendPixConfirmation).toHaveBeenCalledTimes(1);

    const erro = await erroDe(aguardando.service.reenviarConfirmacao({ ...ADMIN, role: "member" }, IGREJA));
    expect(isAppError(erro) && erro.code).toBe("forbidden");
    const outra = await erroDe(aguardando.service.reenviarConfirmacao(ADMIN, OUTRA));
    expect(isAppError(outra) && outra.code).toBe("not_found");
  });

  it("token malformado nem chega ao banco", async () => {
    const { service, repo } = build();
    expect(await service.consultarConfirmacao("curto")).toBeNull();
    expect(await service.consultarConfirmacao(undefined)).toBeNull();
    const erro = await erroDe(service.confirmarPorToken("' or 1=1 --"));
    expect(isAppError(erro) && erro.code).toBe("not_found");
    expect(repo.confirmacaoPorToken).not.toHaveBeenCalled();
    expect(repo.confirmarPorToken).not.toHaveBeenCalled();
  });

  it("token bem formado consulta e confirma", async () => {
    const { service, repo } = build();
    expect((await service.consultarConfirmacao(TOKEN))?.estado).toBe("valido");
    expect(await service.confirmarPorToken(TOKEN)).toEqual({ churchName: "Igreja Betel", publicCode: "betel" });
    expect(repo.confirmarPorToken).toHaveBeenCalledWith(TOKEN);
  });
});
