import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createChurchProfileService,
  publicCodeSchema,
  type ChurchProfileRepository,
  type ProfileActor,
} from "./churchProfileService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";

const ADMIN: ProfileActor = {
  companyId: EMPRESA,
  role: "admin",
  userId: "55555555-5555-4555-8555-555555555555",
};

function build() {
  const repo: ChurchProfileRepository = {
    listCompanyChurches: vi.fn(async () => [
      {
        id: IGREJA,
        name: "Igreja Betel",
        publicCode: "betel",
        address: "Rua A, 10",
        logoUrl: null,
        socialLinks: {},
      },
    ]),
    updateProfile: vi.fn(async () => undefined),
    updateLogo: vi.fn(async () => undefined),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { repo, audit, service: createChurchProfileService({ repo, audit, log: { error: vi.fn() } }) };
}

const base = {
  churchId: IGREJA,
  name: "Igreja Betel",
  address: "Rua das Flores, 540 - Centro",
  publicCode: "betel-lins",
  instagram: "",
  whatsapp: "",
  youtube: "",
  facebook: "",
  site: "",
};

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("publicCodeSchema", () => {
  it("aceita o formato que vira URL", () => {
    expect(publicCodeSchema.parse(" Betel-Lins ")).toBe("betel-lins");
  });

  it("recusa espaço, acento, barra e código curto demais", () => {
    for (const valor of ["betel lins", "betél", "betel/lins", "ab", "-betel", "betel-"]) {
      expect(publicCodeSchema.safeParse(valor).success).toBe(false);
    }
  });
});

describe("save", () => {
  it("grava nome, endereço e redes válidas", async () => {
    const { repo, service } = build();

    await service.save(ADMIN, {
      ...base,
      instagram: "@igrejabetel",
      whatsapp: "14999998888",
      site: "https://betel.org.br",
    });

    expect(repo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: IGREJA,
        companyId: EMPRESA,
        publicCode: "betel-lins",
        socialLinks: {
          instagram: "@igrejabetel",
          whatsapp: "14999998888",
          site: "https://betel.org.br",
        },
      }),
    );
  });

  it("recusa rede que a página pública ignoraria em silêncio", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.save(ADMIN, { ...base, whatsapp: "123" }));

    expect(isAppError(err) && err.message).toMatch(/WhatsApp inválido/);
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("registra a troca do endereço público com o valor antigo", async () => {
    const { audit, service } = build();

    await service.save(ADMIN, { ...base, publicCode: "betel-novo" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "church.profile.updated",
        metadata: { public_code_anterior: "betel", public_code_novo: "betel-novo" },
      }),
    );
  });

  it("member não edita a página da igreja", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.save({ ...ADMIN, role: "member" }, base));

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("igreja de outra empresa não é encontrada", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.save(ADMIN, { ...base, churchId: OUTRA }));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("campo de rede vazio não vira link quebrado", async () => {
    const { repo, service } = build();

    await service.save(ADMIN, base);

    expect(repo.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ socialLinks: {} }));
  });
});

describe("setLogo", () => {
  it("grava a URL do logo da própria igreja", async () => {
    const { repo, service } = build();

    await service.setLogo(ADMIN, IGREJA, "https://cdn/logo.png");

    expect(repo.updateLogo).toHaveBeenCalledWith({
      churchId: IGREJA,
      companyId: EMPRESA,
      logoUrl: "https://cdn/logo.png",
    });
  });

  it("não grava logo em igreja de outra empresa", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.setLogo(ADMIN, OUTRA, "https://cdn/logo.png"));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.updateLogo).not.toHaveBeenCalled();
  });
});
