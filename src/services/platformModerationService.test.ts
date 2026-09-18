import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createPlatformModerationService,
  type PlatformModerationRepository,
} from "./platformModerationService";
import type { PendingProfileChange, SecurityHold } from "@/types/sponsorship";

const PENDENTE: PendingProfileChange = {
  id: "mudanca-1",
  sponsorAccountId: "conta-1",
  sponsorEmail: "padaria@exemplo.com",
  novoDisplayName: "Padaria São João",
  novoLogoPath: null,
  atualDisplayName: "Padaria do João",
  atualLogoUrl: null,
  igrejas: 3,
  createdAt: "2026-09-18T10:00:00Z",
};

const TRAVADA: SecurityHold = {
  sponsorAccountId: "conta-1",
  displayName: "Padaria do João",
  email: "padaria@exemplo.com",
  securityHoldAt: "2026-09-18T10:00:00Z",
  ultimaTentativaNome: "Nome Estranho",
  ultimaTentativaEm: "2026-09-18T09:00:00Z",
};

function build(pendente: PendingProfileChange = PENDENTE) {
  const repo: PlatformModerationRepository = {
    listPendingProfileChanges: vi.fn(async () => [pendente]),
    reviewProfileChange: vi.fn(async () => true),
    listStaffEmails: vi.fn(async () => ["moderacao@exemplo.com"]),
    listAbuseReports: vi.fn(async () => []),
    reviewAbuseReport: vi.fn(async () => true),
    listHiddenSignals: vi.fn(async () => []),
    listSecurityHolds: vi.fn(async () => [TRAVADA]),
    releaseSecurityHold: vi.fn(async () => true),
  };
  const notifier = {
    sendProfileDecision: vi.fn(async () => {}),
    sendHoldReleased: vi.fn(async () => {}),
  };
  const publishLogo = vi.fn(async () => "https://cdn.exemplo.com/publico/conta-1/logo.png");
  const service = createPlatformModerationService({ repo, notifier, publishLogo });
  return { repo, notifier, publishLogo, service };
}

describe("reviewProfileChange", () => {
  it("recusa sem motivo é barrada — o patrocinador precisa saber o que corrigir", async () => {
    const { repo, service } = build();

    const err = await service
      .reviewProfileChange({ changeId: "mudanca-1", approved: false })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.reviewProfileChange).not.toHaveBeenCalled();
  });

  it("aprova sem logo novo sem chamar o storage", async () => {
    const { repo, publishLogo, service } = build();

    await service.reviewProfileChange({ changeId: "mudanca-1", approved: true });

    expect(publishLogo).not.toHaveBeenCalled();
    expect(repo.reviewProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ approved: true, logoUrl: null, via: "painel" }),
    );
  });

  it("publica o arquivo pendente e grava a URL final quando o logo mudou", async () => {
    const { repo, publishLogo, service } = build({
      ...PENDENTE,
      novoLogoPath: "pendente/user-1/abc.png",
    });

    await service.reviewProfileChange({ changeId: "mudanca-1", approved: true });

    expect(publishLogo).toHaveBeenCalledWith({
      pendingPath: "pendente/user-1/abc.png",
      sponsorAccountId: "conta-1",
    });
    expect(repo.reviewProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: "https://cdn.exemplo.com/publico/conta-1/logo.png" }),
    );
  });

  it("não decide alteração que já saiu da fila", async () => {
    const { repo, service } = build();
    vi.mocked(repo.listPendingProfileChanges).mockResolvedValueOnce([]);

    const err = await service
      .reviewProfileChange({ changeId: "mudanca-1", approved: true })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.reviewProfileChange).not.toHaveBeenCalled();
  });

  it("avisa o patrocinador do resultado, com o motivo quando recusa", async () => {
    const { notifier, service } = build();

    await service.reviewProfileChange({
      changeId: "mudanca-1",
      approved: false,
      reason: "O nome não corresponde ao negócio.",
    });

    expect(notifier.sendProfileDecision).toHaveBeenCalledWith({
      to: "padaria@exemplo.com",
      approved: false,
      displayName: "Padaria São João",
      reason: "O nome não corresponde ao negócio.",
    });
  });
});

describe("reviewAbuseReport", () => {
  it("decidir denúncia NÃO esconde ninguém: isso é decisão de cada igreja", async () => {
    const { repo, service } = build();

    await service.reviewAbuseReport({ reportId: "den-1", procedente: true });

    expect(repo.reviewAbuseReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "den-1", procedente: true, via: "painel" }),
    );
    // Nenhuma chamada de exibição: fechar o chamado não mexe em página.
    expect(repo.reviewProfileChange).not.toHaveBeenCalled();
  });

  it("denúncia já decidida devolve erro claro em vez de sumir em silêncio", async () => {
    const { repo, service } = build();
    vi.mocked(repo.reviewAbuseReport).mockResolvedValueOnce(false);

    const err = await service
      .reviewAbuseReport({ reportId: "den-1", procedente: true })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
  });
});

describe("releaseSecurityHold", () => {
  it("libera, avisa o dono e registra", async () => {
    const { repo, notifier, service } = build();

    await service.releaseSecurityHold({ sponsorAccountId: "conta-1" });

    expect(repo.releaseSecurityHold).toHaveBeenCalledWith({
      sponsorAccountId: "conta-1",
      via: "painel",
    });
    expect(notifier.sendHoldReleased).toHaveBeenCalledWith({
      to: "padaria@exemplo.com",
      displayName: "Padaria do João",
    });
  });

  it("liberar NÃO republica o que foi desfeito", async () => {
    const { repo, service } = build();

    await service.releaseSecurityHold({ sponsorAccountId: "conta-1" });

    // Republicar seria decidir pelo dono justamente no caso em que há dúvida
    // sobre quem é o dono. A pessoa pede de novo e passa pela fila.
    expect(repo.reviewProfileChange).not.toHaveBeenCalled();
  });

  it("conta que não está bloqueada devolve erro claro", async () => {
    const { repo, service } = build();
    vi.mocked(repo.listSecurityHolds).mockResolvedValueOnce([]);

    const err = await service
      .releaseSecurityHold({ sponsorAccountId: "conta-1" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.releaseSecurityHold).not.toHaveBeenCalled();
  });
});
