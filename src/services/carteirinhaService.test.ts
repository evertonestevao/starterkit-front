import { describe, expect, it, vi } from "vitest";
import {
  canCarteirinha,
  createCarteirinhaService,
  type CarteirinhaActor,
  type CarteirinhaRepository,
  type FotoStorage,
} from "./carteirinhaService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const MEMBRO = "33333333-3333-4333-8333-333333333333";
const NOVO_ID = "44444444-4444-4444-8444-444444444444";
const HOJE = "2026-10-06";
const TOKEN = "t".repeat(43);

const secretario: CarteirinhaActor = { companyId: EMPRESA, role: "member", liberado: true };
const semAcesso: CarteirinhaActor = { companyId: EMPRESA, role: "member", liberado: false };

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");

type Termo = NonNullable<Awaited<ReturnType<CarteirinhaRepository["consentimento"]>>>;
const termo = (over: Partial<Termo> = {}): Termo => ({
  companyId: EMPRESA,
  cadastro: true,
  foto: true,
  carteirinha: true,
  assinadoEm: "2026-10-01",
  responsavelNome: null,
  temFoto: false,
  fotoPath: null,
  ...over,
});

function build(over: Partial<CarteirinhaRepository> = {}, consent: Termo | null = termo()) {
  const repo = {
    getChurch: vi.fn(async () => ({ id: "igreja", name: "Igreja" })),
    consentimento: vi.fn(async () => consent),
    salvarConsentimento: vi.fn(async () => null),
    definirFoto: vi.fn(async () => null),
    semTermo: vi.fn(async () => []),
    carteirinha: vi.fn(async () => null),
    emitir: vi.fn(async () => "A1B2C3D4E5F60789"),
    cancelar: vi.fn(async () => undefined),
    porToken: vi.fn(async () => null),
    fotoPathPorToken: vi.fn(async () => null),
    verificar: vi.fn(async () => null),
    ...over,
  } as unknown as CarteirinhaRepository;
  const storage = {
    upload: vi.fn(async ({ path }: { path: string }) => ({ path })),
    remove: vi.fn(async () => undefined),
    download: vi.fn(async () => JPEG),
  } satisfies FotoStorage;
  const log = { error: vi.fn() };
  const svc = createCarteirinhaService({
    repo,
    storage,
    tokens: { make: () => TOKEN, hash: (t) => `hash(${t})` },
    novoId: () => NOVO_ID,
    hoje: () => HOJE,
    log,
  });
  return { repo, storage, svc, log };
}

describe("acesso", () => {
  it("quem administra ou tem Membros", () => {
    expect(canCarteirinha("admin", false)).toBe(true);
    expect(canCarteirinha("member", true)).toBe(true);
    expect(canCarteirinha("member", false)).toBe(false);
  });

  it("sem o módulo, nada funciona e nada é enviado", async () => {
    const { svc, repo, storage } = build();
    await expect(svc.consentimento(semAcesso, MEMBRO)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.registrarConsentimento(semAcesso, MEMBRO, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.enviarFoto(semAcesso, MEMBRO, JPEG)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.emitir(semAcesso, MEMBRO, "2027-10-06")).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.cancelar(semAcesso, MEMBRO)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.consentimento).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("consentimento", () => {
  const base = { cadastro: true, foto: true, carteirinha: false, assinadoEm: "2026-10-05", responsavelNome: " " };

  it("registra o que foi marcado, limpando texto vazio", async () => {
    const { svc, repo } = build();
    await svc.registrarConsentimento(secretario, MEMBRO, base);
    expect(repo.salvarConsentimento).toHaveBeenCalledWith(MEMBRO, { ...base, responsavelNome: null });
  });

  it("sem o cadastro, foto e carteirinha não valem", async () => {
    const { svc, repo } = build();
    await svc.registrarConsentimento(secretario, MEMBRO, { ...base, cadastro: false, carteirinha: true });
    expect(repo.salvarConsentimento).toHaveBeenCalledWith(MEMBRO, {
      cadastro: false,
      foto: false,
      carteirinha: false,
      assinadoEm: null,
      responsavelNome: null,
    });
  });

  it("exige a data da assinatura, e não aceita data no futuro", async () => {
    const { svc, repo } = build();
    await expect(svc.registrarConsentimento(secretario, MEMBRO, { ...base, assinadoEm: null })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(
      svc.registrarConsentimento(secretario, MEMBRO, { ...base, assinadoEm: "2026-10-07" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.salvarConsentimento).not.toHaveBeenCalled();
  });

  it("retirar a foto do termo apaga o arquivo", async () => {
    const { svc, storage } = build({ salvarConsentimento: vi.fn(async () => "empresa/membro/antiga.jpg") });
    await svc.registrarConsentimento(secretario, MEMBRO, { ...base, foto: false });
    expect(storage.remove).toHaveBeenCalledWith("empresa/membro/antiga.jpg");
  });

  it("falha ao apagar o arquivo não derruba o registro", async () => {
    const { svc, storage, log } = build({ salvarConsentimento: vi.fn(async () => "x/y/z.jpg") });
    storage.remove.mockRejectedValueOnce(new Error("bucket fora"));
    await expect(svc.registrarConsentimento(secretario, MEMBRO, { ...base, foto: false })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});

describe("foto", () => {
  it("envia para a pasta do membro e liga ao cadastro", async () => {
    const { svc, storage, repo } = build();
    await svc.enviarFoto(secretario, MEMBRO, JPEG);
    const path = `${EMPRESA}/${MEMBRO}/${NOVO_ID}.jpg`;
    expect(storage.upload).toHaveBeenCalledWith({ path, content: JPEG, contentType: "image/jpeg" });
    expect(repo.definirFoto).toHaveBeenCalledWith(MEMBRO, path);
  });

  it("o tipo vem dos bytes: PNG entra, WebP e SVG não", async () => {
    const { svc, storage } = build();
    await svc.enviarFoto(secretario, MEMBRO, PNG);
    expect(storage.upload).toHaveBeenLastCalledWith(expect.objectContaining({ contentType: "image/png" }));
    for (const ruim of [WEBP, SVG, new Uint8Array()]) {
      await expect(svc.enviarFoto(secretario, MEMBRO, ruim)).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("recusa foto acima de 1 MB", async () => {
    const { svc, storage } = build();
    const grande = new Uint8Array(1024 * 1024 + 1);
    grande.set([0xff, 0xd8, 0xff]);
    await expect(svc.enviarFoto(secretario, MEMBRO, grande)).rejects.toMatchObject({ code: "validation_error" });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("sem termo, ou sem a foto no termo, nem envia", async () => {
    const semTermo = build({}, null);
    await expect(semTermo.svc.enviarFoto(secretario, MEMBRO, JPEG)).rejects.toMatchObject({ code: "validation_error" });
    const semFoto = build({}, termo({ foto: false }));
    await expect(semFoto.svc.enviarFoto(secretario, MEMBRO, JPEG)).rejects.toMatchObject({ code: "validation_error" });
    expect(semTermo.storage.upload).not.toHaveBeenCalled();
    expect(semFoto.storage.upload).not.toHaveBeenCalled();
  });

  it("membro de outra igreja (que não a ativa) é tratado como sem termo", async () => {
    const { svc, storage } = build({}, termo({ companyId: OUTRA, fotoPath: "x/y/z.jpg" }));
    await expect(svc.enviarFoto(secretario, MEMBRO, JPEG)).rejects.toMatchObject({ code: "validation_error" });
    expect(await svc.foto(secretario, MEMBRO)).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("trocar a foto apaga a anterior", async () => {
    const { svc, storage } = build({ definirFoto: vi.fn(async () => "empresa/membro/antiga.jpg") });
    await svc.enviarFoto(secretario, MEMBRO, JPEG);
    expect(storage.remove).toHaveBeenCalledWith("empresa/membro/antiga.jpg");
  });

  it("se o banco recusar, o arquivo que subiu é apagado", async () => {
    const { svc, storage } = build({
      definirFoto: vi.fn(async () => {
        throw new Error("recusado");
      }),
    });
    await expect(svc.enviarFoto(secretario, MEMBRO, JPEG)).rejects.toThrow("recusado");
    expect(storage.remove).toHaveBeenCalledWith(`${EMPRESA}/${MEMBRO}/${NOVO_ID}.jpg`);
  });

  it("remover tira o vínculo e apaga o arquivo", async () => {
    const { svc, storage, repo } = build(
      { definirFoto: vi.fn(async () => "a/b/c.jpg") },
      termo({ fotoPath: "a/b/c.jpg", temFoto: true }),
    );
    await svc.removerFoto(secretario, MEMBRO);
    expect(repo.definirFoto).toHaveBeenCalledWith(MEMBRO, null);
    expect(storage.remove).toHaveBeenCalledWith("a/b/c.jpg");
  });

  it("arquivo no bucket que não é imagem não é entregue", async () => {
    const { svc, storage } = build({}, termo({ fotoPath: "a/b/c.jpg" }));
    storage.download.mockResolvedValueOnce(SVG);
    expect(await svc.foto(secretario, MEMBRO)).toBeNull();
  });
});

describe("carteirinha", () => {
  it("emite guardando só o hash do link, e devolve o link uma vez", async () => {
    const { svc, repo } = build();
    const r = await svc.emitir(secretario, MEMBRO, "2027-10-06");
    expect(repo.emitir).toHaveBeenCalledWith(MEMBRO, `hash(${TOKEN})`, "2027-10-06");
    expect(r).toEqual({ token: TOKEN, codigo: "A1B2C3D4E5F60789" });
  });

  it("validade tem de ser futura e de até 5 anos", async () => {
    const { svc, repo } = build();
    for (const ruim of ["2026-10-06", "2026-01-01", "2031-11-01", "06/10/2027", null]) {
      await expect(svc.emitir(secretario, MEMBRO, ruim)).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(repo.emitir).not.toHaveBeenCalled();
  });

  it("sem a carteirinha no termo, não emite", async () => {
    const { svc, repo } = build({}, termo({ carteirinha: false }));
    await expect(svc.emitir(secretario, MEMBRO, "2027-10-06")).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.emitir).not.toHaveBeenCalled();
  });
});

describe("sem login", () => {
  it("link e código malformados nem chegam ao banco", async () => {
    const { svc, repo } = build();
    expect(await svc.porToken("curto")).toBeNull();
    expect(await svc.fotoPorToken("' or 1=1 --")).toBeNull();
    expect(await svc.verificar("XYZ")).toBeNull();
    expect(await svc.verificar(undefined)).toBeNull();
    expect(repo.porToken).not.toHaveBeenCalled();
    expect(repo.fotoPathPorToken).not.toHaveBeenCalled();
    expect(repo.verificar).not.toHaveBeenCalled();
  });

  it("o código do QR é procurado em maiúsculas", async () => {
    const { svc, repo } = build();
    await svc.verificar(" a1b2c3d4e5f60789 ");
    expect(repo.verificar).toHaveBeenCalledWith("A1B2C3D4E5F60789");
  });

  it("a foto pelo link só sai se o link ainda vale", async () => {
    const semLink = build();
    expect(await semLink.svc.fotoPorToken(TOKEN)).toBeNull();
    expect(semLink.storage.download).not.toHaveBeenCalled();
    const comLink = build({ fotoPathPorToken: vi.fn(async () => "a/b/c.jpg") });
    expect((await comLink.svc.fotoPorToken(TOKEN))?.tipo).toBe("image/jpeg");
  });
});
