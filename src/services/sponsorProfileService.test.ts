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
  userId: "user-1",
  displayName: "Padaria do João",
  logoUrl: null,
  link: null,
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
    updateVisibility: vi.fn(async () => {}),
  };
  const notifier: SponsorProfileNotifier = {
    sendChangeRequested: vi.fn(async () => {}),
    sendStaffAlert: vi.fn(async () => {}),
  };
  const storage = {
    upload: vi.fn(async () => {}),
    publicUrl: (path: string) => `https://cdn.exemplo.com/${path}`,
  };
  const service = createSponsorProfileService({
    repo,
    notifier,
    storage,
    makeFileId: () => "arquivo-1",
    appUrl: "https://app.exemplo.com",
    makeToken: () => "token-de-teste-com-tamanho-suficiente",
    hashToken: (t) => `hash:${t}`,
  });
  return { repo, notifier, storage, service };
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

describe("getMyProfile", () => {
  it("devolve a URL do logo enviado que ainda espera conferência", async () => {
    const { repo, service } = build();
    vi.mocked(repo.getMyPendingChange).mockResolvedValueOnce({
      id: "mudanca-1",
      novo_display_name: null,
      novo_logo_path: "pendente/user-1/arquivo-1.png",
      novo_link_alterado: false,
      novo_link_tipo: null,
      novo_link_valor: null,
      anterior_display_name: "Padaria do João",
      anterior_logo_url: null,
      status: "pendente",
      motivo_recusa: null,
      created_at: "2026-09-18T10:00:00Z",
      decided_at: null,
    });

    const { pendingLogoUrl } = await service.getMyProfile();

    expect(pendingLogoUrl).toBe("https://cdn.exemplo.com/pendente/user-1/arquivo-1.png");
  });

  it("sem logo pendente (ou pedido só de nome), não há URL pendente", async () => {
    const { service } = build();

    expect((await service.getMyProfile()).pendingLogoUrl).toBeNull();
  });
});

describe("link da logo", () => {
  it("WhatsApp digitado vira pedido com o número normalizado, e o email mostra o wa.me", async () => {
    const { repo, notifier, service } = build();

    const pediu = await service.requestChange({ link: "(11) 91234-5678" });

    expect(pediu).toBe(true);
    expect(repo.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: null,
        link: { value: { tipo: "whatsapp", valor: "5511912345678" } },
      }),
    );
    expect(notifier.sendChangeRequested).toHaveBeenCalledWith(
      expect.objectContaining({ linkChange: { href: "https://wa.me/5511912345678" } }),
    );
  });

  it("site sem esquema ganha https e vai para a moderação, não direto para a conta", async () => {
    const { repo, notifier, service } = build();

    await service.requestChange({ link: "padaria.com.br" });

    expect(repo.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({ link: { value: { tipo: "link", valor: "https://padaria.com.br/" } } }),
    );
    expect(notifier.sendStaffAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining(["Link da logo: https://padaria.com.br/"]),
      }),
    );
  });

  it("recusa endereço perigoso antes de qualquer coisa ser gravada", async () => {
    const { repo, service } = build();

    const err = await service.requestChange({ link: "javascript:alert(1)" }).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.requestChange).not.toHaveBeenCalled();
  });

  it("repetir o link que já vale não vira fila", async () => {
    const { repo, service } = build({ link: { tipo: "link", valor: "https://padaria.com.br/" } });

    expect(await service.requestChange({ link: "https://padaria.com.br" })).toBe(false);
    expect(repo.requestChange).not.toHaveBeenCalled();
  });

  it("campo vazio remove o link que existia; sem link e vazio não faz nada", async () => {
    const comLink = build({ link: { tipo: "whatsapp", valor: "5511912345678" } });
    expect(await comLink.service.requestChange({ link: "" })).toBe(true);
    expect(comLink.repo.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({ link: { value: null } }),
    );
    expect(comLink.notifier.sendChangeRequested).toHaveBeenCalledWith(
      expect.objectContaining({ linkChange: { href: null } }),
    );

    const semLink = build();
    expect(await semLink.service.requestChange({ link: "" })).toBe(false);
    expect(semLink.repo.requestChange).not.toHaveBeenCalled();
  });

  it("não mexer no campo deixa o link como está", async () => {
    const { repo, service } = build({ link: { tipo: "link", valor: "https://padaria.com.br/" } });

    await service.requestChange({ displayName: "Padaria São João" });

    expect(repo.requestChange).toHaveBeenCalledWith(expect.objectContaining({ link: null }));
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

describe("logo", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

  it("guarda na pasta pendente do próprio usuário, com o tipo tirado dos bytes", async () => {
    const { repo, storage, service } = build();

    const pediu = await service.requestChange({}, { bytes: PNG, declaredType: "image/gif" });

    expect(pediu).toBe(true);
    // O declaredType era mentira; o que vale é a assinatura do arquivo.
    expect(storage.upload).toHaveBeenCalledWith({
      path: "pendente/user-1/arquivo-1.png",
      bytes: PNG,
      contentType: "image/png",
    });
    expect(repo.requestChange).toHaveBeenCalledWith(
      expect.objectContaining({ logoPath: "pendente/user-1/arquivo-1.png" }),
    );
  });

  it("recusa arquivo que não é imagem aceita, sem subir nada", async () => {
    const { repo, storage, service } = build();
    const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");

    const err = await service
      .requestChange({}, { bytes: svg, declaredType: "image/png" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.requestChange).not.toHaveBeenCalled();
  });

  it("recusa arquivo acima de 1 MB", async () => {
    const { storage, service } = build();
    const grande = new Uint8Array(1024 * 1024 + 1);
    grande.set(PNG);

    const err = await service
      .requestChange({}, { bytes: grande, declaredType: "image/png" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("conta bloqueada não sobe logo nenhum", async () => {
    const { storage, service } = build({ securityHoldAt: "2026-09-18T10:00:00Z" });

    await service.requestChange({}, { bytes: PNG, declaredType: "image/png" }).catch(() => {});

    expect(storage.upload).not.toHaveBeenCalled();
  });
});
