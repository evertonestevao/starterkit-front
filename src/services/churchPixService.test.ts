import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createChurchPixService,
  detectPixKeyKind,
  maskPixKey,
  type ChurchPixRepository,
  type PixActor,
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

function build() {
  const repo: ChurchPixRepository = {
    listCompanyChurches: vi.fn(async () => [
      {
        id: IGREJA,
        name: "Igreja Betel",
        pixChave: "antiga@chave.org",
        pixTitular: "Igreja Betel",
        pixStatus: "aprovado" as const,
        pixMotivoRecusa: null,
      },
    ]),
    updatePix: vi.fn(async () => undefined),
    listCompanyAdminEmails: vi.fn(async () => ["pastor@igreja.org", "tesoureiro@igreja.org"]),
  };
  const notifier = { sendPixChanged: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const log = { error: vi.fn() };
  return { repo, notifier, audit, service: createChurchPixService({ repo, notifier, audit, log }), log };
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
