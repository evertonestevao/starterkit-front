import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createChurchProfileService,
  publicCodeSchema,
  type ChurchProfile,
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

function build(sobrescrever: Partial<ChurchProfile> = {}) {
  const repo: ChurchProfileRepository = {
    listCompanyChurches: vi.fn(async () => [
      {
        id: IGREJA,
        name: "Igreja Betel",
        nomeProprio: "Igreja Betel",
        sobrenome: null,
        herdarNome: false,
        parentName: null,
        publicCode: "betel",
        chavePublica: "betel",
        ehSedeDeRede: false,
        sobre: null,
        paginaAtiva: true,
        address: "Rua A, 10",
        logoUrl: null,
        socialLinks: {},
        hasParent: false,
        appearanceMode: "inherit" as const,
        own: { theme: "dark" as const, accent: null },
        inherited: null,
        ...sobrescrever,
      },
    ]),
    updateProfile: vi.fn(async () => undefined),
    updateLogo: vi.fn(async () => undefined),
    setPaginaAtiva: vi.fn(async () => undefined),
    updateAppearance: vi.fn(async () => undefined),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { repo, audit, service: createChurchProfileService({ repo, audit, log: { error: vi.fn() } }) };
}

const base = {
  churchId: IGREJA,
  name: "Igreja Betel",
  sobrenome: "",
  herdarNome: false,
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

describe("definirPaginaAtiva", () => {
  it("quem administra publica e tira do ar; fica registrado", async () => {
    const { service, repo, audit } = build({ paginaAtiva: false });
    await expect(service.definirPaginaAtiva(ADMIN, IGREJA, true)).resolves.toEqual({ nome: "Igreja Betel" });
    await service.definirPaginaAtiva(ADMIN, IGREJA, false);
    expect(repo.setPaginaAtiva).toHaveBeenNthCalledWith(1, IGREJA, true);
    expect(repo.setPaginaAtiva).toHaveBeenNthCalledWith(2, IGREJA, false);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "church.pagina_publicada" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "church.pagina_fora_do_ar" }));
  });

  it("member não publica, e igreja de outra conta é não encontrada", async () => {
    const { service, repo } = build();
    await expect(service.definirPaginaAtiva({ ...ADMIN, role: "member" }, IGREJA, true)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      service.definirPaginaAtiva(ADMIN, "99999999-9999-4999-8999-999999999999", true),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(repo.setPaginaAtiva).not.toHaveBeenCalled();
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

describe("saveAppearance", () => {
  const custom = { churchId: IGREJA, mode: "custom", theme: "clean", accentColor: "#2563EB" };

  it("grava o tema e a cor normalizada (#rrggbb minúsculo)", async () => {
    const { repo, audit, service } = build();

    await service.saveAppearance(ADMIN, custom);

    expect(repo.updateAppearance).toHaveBeenCalledWith({
      churchId: IGREJA,
      companyId: EMPRESA,
      mode: "custom",
      theme: "clean",
      accent: "#2563eb",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "church.appearance.updated" }),
    );
  });

  it("cor vazia grava sem destaque próprio (usa a cor do tema)", async () => {
    const { repo, service } = build();

    await service.saveAppearance(ADMIN, { ...custom, accentColor: "" });

    expect(repo.updateAppearance).toHaveBeenCalledWith(expect.objectContaining({ accent: null }));
  });

  it("recusa cor que não é hexadecimal e tema que não existe, sem gravar nada", async () => {
    const { repo, service } = build();

    for (const ruim of [
      { ...custom, accentColor: "red" },
      { ...custom, accentColor: "#2563eb;background:url(//x)" },
      { ...custom, theme: "neon" },
      { ...custom, mode: "qualquer" },
      { ...custom, churchId: "nao-e-uuid" },
    ]) {
      const err = await erroDe(service.saveAppearance(ADMIN, ruim));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.updateAppearance).not.toHaveBeenCalled();
  });

  it("member não muda a aparência", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.saveAppearance({ ...ADMIN, role: "member" }, custom));

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.updateAppearance).not.toHaveBeenCalled();
  });

  it("não mexe em igreja que não é da empresa do usuário", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.saveAppearance(ADMIN, { ...custom, churchId: OUTRA }));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.updateAppearance).not.toHaveBeenCalled();
  });

  it("só herda quem tem igreja-mãe; e ao herdar, tema e cor enviados são descartados", async () => {
    const semMae = build();
    const err = await erroDe(
      semMae.service.saveAppearance(ADMIN, { churchId: IGREJA, mode: "inherit", theme: "", accentColor: "" }),
    );
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(semMae.repo.updateAppearance).not.toHaveBeenCalled();

    const comMae = build({ hasParent: true });
    await comMae.service.saveAppearance(ADMIN, {
      churchId: IGREJA,
      mode: "inherit",
      theme: "clean",
      accentColor: "#2563eb",
    });
    expect(comMae.repo.updateAppearance).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "inherit", accent: null }),
    );
  });
});

describe("nome e sobrenome", () => {
  it("grava o nome próprio e o sobrenome normalizado (espaços aparados)", async () => {
    const { repo, service } = build();

    await service.save(ADMIN, { ...base, name: "Assembleia de Deus Ministério no Ipiranga", sobrenome: "  Prainha   - Promissão " });

    expect(repo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        nomeProprio: "Assembleia de Deus Ministério no Ipiranga",
        sobrenome: "Prainha - Promissão",
        herdarNome: false,
      }),
    );
  });

  it("sobrenome em branco é gravado como nenhum", async () => {
    const { repo, service } = build();

    await service.save(ADMIN, { ...base, sobrenome: "   " });

    expect(repo.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ sobrenome: null }));
  });

  it("recusa sobrenome grande demais", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.save(ADMIN, { ...base, sobrenome: "x".repeat(121) }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("só herda o nome quem tem igreja superior", async () => {
    const semMae = build();
    const err = await erroDe(semMae.service.save(ADMIN, { ...base, herdarNome: true }));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(semMae.repo.updateProfile).not.toHaveBeenCalled();

    const comMae = build({ hasParent: true, parentName: "Comunidade da Graça" });
    await comMae.service.save(ADMIN, { ...base, herdarNome: true, sobrenome: "Prainha" });
    expect(comMae.repo.updateProfile).toHaveBeenCalledWith(
      // O nome próprio segue gravado (volta a valer se ela deixar de herdar); o sobrenome é só dela.
      expect.objectContaining({ herdarNome: true, nomeProprio: "Igreja Betel", sobrenome: "Prainha" }),
    );
  });
});
