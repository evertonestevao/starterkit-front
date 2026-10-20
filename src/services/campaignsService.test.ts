import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import { createCampaignsService, type CampaignsRepository, type CompanyCampaign } from "./campaignsService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const IGREJA_DE_OUTRA = "44444444-4444-4444-8444-444444444444";
const CAMPANHA_ID = "99999999-9999-4999-8999-999999999999";
const AGORA = new Date("2026-09-25T12:00:00Z");

function campanha(overrides: Partial<CompanyCampaign> = {}): CompanyCampaign {
  return {
    id: "campanha-1",
    churchId: IGREJA,
    churchName: "Igreja Esperança",
    titulo: "Reforma do telhado",
    fotoCapaUrl: null,
    historia: "Precisamos trocar o telhado antes das chuvas.",
    metaCents: 500000,
    totalArrecadadoLiquidoCents: 0,
    metodoRecebimento: "pix",
    mostrarProgresso: true,
    valoresSugeridos: [],
    valorPadraoCents: null,
    permitirValorLivre: true,
    status: "rascunho",
    feedbackTexto: null,
    feedbackFotoUrl: null,
    encerradaAt: null,
    createdAt: AGORA.toISOString(),
    ...overrides,
  };
}

function build() {
  const repo: CampaignsRepository = {
    listCompanyChurches: vi.fn(async () => [{ id: IGREJA, name: "Igreja Esperança" }]),
    isCardReceivingApproved: vi.fn(async () => true),
    listCampaigns: vi.fn(async () => []),
    findCampaign: vi.fn(async () => campanha()),
    insertCampaign: vi.fn(async () => "campanha-1"),
    updateCampaign: vi.fn(async () => true),
    setStatus: vi.fn(async () => true),
    setFeedback: vi.fn(async () => true),
    setCoverUrl: vi.fn(async () => true),
    setFeedbackFotoUrl: vi.fn(async () => true),
    softDeleteCampaign: vi.fn(async () => true),
    listDonations: vi.fn(async () => []),
    confirmPixDonation: vi.fn(async () => {}),
  };
  return { repo, service: createCampaignsService(repo, () => AGORA) };
}

const valido = {
  churchId: IGREJA,
  titulo: "Reforma do telhado",
  historia: "Precisamos trocar o telhado antes das chuvas.",
  meta: "5.000,00",
  metodoRecebimento: "pix" as const,
  mostrarProgresso: true,
  permitirValorLivre: true,
  valorSugerido1: "",
  valorSugerido2: "",
  valorSugerido3: "",
  valorPadraoIndice: "",
};

describe("create", () => {
  it("cria com meta em centavos e nasce sem valores sugeridos", async () => {
    const { repo, service } = build();

    const id = await service.create({ companyId: EMPRESA, role: "owner" }, valido);

    expect(id).toBe("campanha-1");
    expect(repo.insertCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: IGREJA, metaCents: 500000, valoresSugeridos: [], valorPadraoCents: null }),
    );
  });

  it("member não cria campanha", async () => {
    const { repo, service } = build();

    const err = await service.create({ companyId: EMPRESA, role: "member" }, valido).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.insertCampaign).not.toHaveBeenCalled();
  });

  it("igreja que não é da empresa ativa é recusada", async () => {
    const { repo, service } = build();

    const err = await service
      .create({ companyId: EMPRESA, role: "admin" }, { ...valido, churchId: IGREJA_DE_OUTRA })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.insertCampaign).not.toHaveBeenCalled();
  });

  it("meta em branco ou zero é recusada", async () => {
    const { repo, service } = build();

    const err = await service.create({ companyId: EMPRESA, role: "admin" }, { ...valido, meta: "" }).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.insertCampaign).not.toHaveBeenCalled();
  });

  it("até 3 valores sugeridos, com o padrão apontando para o índice preenchido", async () => {
    const { repo, service } = build();

    await service.create(
      { companyId: EMPRESA, role: "admin" },
      { ...valido, valorSugerido1: "50,00", valorSugerido2: "100,00", valorSugerido3: "", valorPadraoIndice: "2" },
    );

    expect(repo.insertCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ valoresSugeridos: [5000, 10000], valorPadraoCents: 10000 }),
    );
  });

  it("padrão apontando para um slot vazio é recusado", async () => {
    const { repo, service } = build();

    const err = await service
      .create(
        { companyId: EMPRESA, role: "admin" },
        { ...valido, valorSugerido1: "50,00", valorSugerido2: "", valorSugerido3: "", valorPadraoIndice: "2" },
      )
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.insertCampaign).not.toHaveBeenCalled();
  });

  it("cartão exige a subconta da igreja já aprovada", async () => {
    const { repo, service } = build();
    (repo.isCardReceivingApproved as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const err = await service
      .create({ companyId: EMPRESA, role: "admin" }, { ...valido, metodoRecebimento: "gateway" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.insertCampaign).not.toHaveBeenCalled();
  });

  it("PIX não exige subconta aprovada", async () => {
    const { repo, service } = build();
    (repo.isCardReceivingApproved as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await service.create({ companyId: EMPRESA, role: "admin" }, valido);

    expect(repo.insertCampaign).toHaveBeenCalled();
  });
});

describe("activate e close", () => {
  it("ativa uma campanha em rascunho", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "rascunho" }));

    await service.activate({ companyId: EMPRESA, role: "admin" }, CAMPANHA_ID);

    expect(repo.setStatus).toHaveBeenCalledWith(EMPRESA, CAMPANHA_ID, "ativa", null);
  });

  it("não ativa uma campanha que já está ativa", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "ativa" }));

    await expect(
      service.activate({ companyId: EMPRESA, role: "admin" }, CAMPANHA_ID),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(repo.setStatus).not.toHaveBeenCalled();
  });

  it("encerra uma campanha ativa, gravando o instante", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "ativa" }));

    await service.close({ companyId: EMPRESA, role: "admin" }, CAMPANHA_ID);

    expect(repo.setStatus).toHaveBeenCalledWith(EMPRESA, CAMPANHA_ID, "encerrada", AGORA.toISOString());
  });

  it("não encerra uma campanha em rascunho", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "rascunho" }));

    await expect(
      service.close({ companyId: EMPRESA, role: "admin" }, CAMPANHA_ID),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(repo.setStatus).not.toHaveBeenCalled();
  });
});

describe("setFeedback", () => {
  it("só aceita devolutiva depois de encerrada", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "ativa" }));

    const err = await service
      .setFeedback({ companyId: EMPRESA, role: "admin" }, { campaignId: CAMPANHA_ID, feedbackTexto: "Concluído!" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("conflict");
    expect(repo.setFeedback).not.toHaveBeenCalled();
  });

  it("salva a devolutiva de uma campanha encerrada", async () => {
    const { repo, service } = build();
    (repo.findCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(campanha({ status: "encerrada" }));

    await service.setFeedback(
      { companyId: EMPRESA, role: "admin" },
      { campaignId: CAMPANHA_ID, feedbackTexto: "Telhado trocado, obrigado a todos!" },
    );

    expect(repo.setFeedback).toHaveBeenCalledWith(EMPRESA, CAMPANHA_ID, "Telhado trocado, obrigado a todos!");
  });
});

describe("confirmPixDonation", () => {
  it("member não confirma doação", async () => {
    const { repo, service } = build();

    await expect(
      service.confirmPixDonation({ companyId: EMPRESA, role: "member" }, "doacao-1"),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.confirmPixDonation).not.toHaveBeenCalled();
  });

  it("admin confirma, delegando ao repository (a RLS/RPC confere o dono de novo)", async () => {
    const { repo, service } = build();

    await service.confirmPixDonation({ companyId: EMPRESA, role: "admin" }, "99999999-9999-4999-8999-999999999999");

    expect(repo.confirmPixDonation).toHaveBeenCalledWith("99999999-9999-4999-8999-999999999999");
  });
});

describe("canManageCampaigns com cargo liberado", () => {
  it("membro só gerencia com Campanhas liberado; quem administra, sempre", async () => {
    const { canManageCampaigns } = await import("./campaignsService");
    expect(canManageCampaigns("member")).toBe(false);
    expect(canManageCampaigns("member", true)).toBe(true);
    expect(canManageCampaigns("owner")).toBe(true);
  });
});
