import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createSponsorProfileService,
  type SponsorProfileAccount,
  type SponsorProfileNotifier,
  type SponsorProfileRepository,
} from "./sponsorProfileService";

const CONTA: SponsorProfileAccount = {
  id: "conta-1",
  displayName: "Padaria do João",
  logoUrl: null,
  email: "padaria@exemplo.com",
  securityHoldAt: null,
};

function build(overrides: Partial<SponsorProfileAccount> = {}) {
  const repo: SponsorProfileRepository = {
    getMyAccount: vi.fn(async () => ({ ...CONTA, ...overrides })),
    getMyPendingChange: vi.fn(async () => null),
    requestChange: vi.fn(async () => "mudanca-1"),
    cancelByToken: vi.fn(async () => true),
    updatePhone: vi.fn(async () => {}),
  };
  const notifier: SponsorProfileNotifier = {
    sendChangeRequested: vi.fn(async () => {}),
    sendStaffAlert: vi.fn(async () => {}),
  };
  const service = createSponsorProfileService({
    repo,
    notifier,
    appUrl: "https://app.exemplo.com",
    makeToken: () => "token-de-teste-com-tamanho-suficiente",
    hashToken: (t) => `hash:${t}`,
  });
  return { repo, notifier, service };
}

describe("requestChange", () => {
  it("não vira pedido quando o nome enviado é o que já está valendo", async () => {
    const { repo, notifier, service } = build();

    const pediu = await service.requestChange({ displayName: "Padaria do João" });

    expect(pediu).toBe(false);
    expect(repo.requestChange).not.toHaveBeenCalled();
    // Nada de encher a fila da moderação com "alteração" que não altera nada.
    expect(notifier.sendStaffAlert).not.toHaveBeenCalled();
  });

  it("guarda só o hash do token e manda o texto puro no link do email", async () => {
    const { repo, notifier, service } = build();

    await service.requestChange({ displayName: "Padaria São João" });

    expect(repo.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Padaria São João",
        tokenHash: "hash:token-de-teste-com-tamanho-suficiente",
      }),
    );
    expect(notifier.sendChangeRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        undoUrl:
          "https://app.exemplo.com/patrocinador/alteracao/token-de-teste-com-tamanho-suficiente",
        // O email vai para o endereço da conta, não para um informado no form.
        to: "padaria@exemplo.com",
      }),
    );
  });

  it("avisa a moderação de que há coisa na fila", async () => {
    const { notifier, service } = build();

    await service.requestChange({ displayName: "Padaria São João" });

    expect(notifier.sendStaffAlert).toHaveBeenCalledTimes(1);
  });

  it("recusa alteração de conta bloqueada pelo “não fui eu”", async () => {
    const { repo, service } = build({ securityHoldAt: "2026-09-18T10:00:00Z" });

    const err = await service.requestChange({ displayName: "Outro Nome" }).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.requestChange).not.toHaveBeenCalled();
  });
});

describe("undoByToken", () => {
  it("ignora token curto sem consultar o banco", async () => {
    const { repo, service } = build();

    expect(await service.undoByToken("curto")).toBe(false);
    expect(repo.cancelByToken).not.toHaveBeenCalled();
  });

  it("desfaz pelo hash e avisa a moderação", async () => {
    const { repo, notifier, service } = build();

    const ok = await service.undoByToken("token-de-teste-com-tamanho-suficiente");

    expect(ok).toBe(true);
    expect(repo.cancelByToken).toHaveBeenCalledWith("hash:token-de-teste-com-tamanho-suficiente");
    expect(notifier.sendStaffAlert).toHaveBeenCalledTimes(1);
  });

  it("token que não existe não avisa ninguém", async () => {
    const { repo, notifier, service } = build();
    vi.mocked(repo.cancelByToken).mockResolvedValueOnce(false);

    expect(await service.undoByToken("token-de-teste-com-tamanho-suficiente")).toBe(false);
    expect(notifier.sendStaffAlert).not.toHaveBeenCalled();
  });
});
