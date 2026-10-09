import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type { CompanyWithRole, MemberWithProfile } from "@/types/tenant";
import {
  createTenantService,
  normalizePageParams,
  slugify,
  type TenantRepository,
} from "./tenantService";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

function makeMember(overrides: Partial<MemberWithProfile>): MemberWithProfile {
  return {
    id: "m1",
    company_id: COMPANY_ID,
    user_id: "u1",
    role: "member",
    invited_by: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    profile: { full_name: "Fulano", avatar_url: null },
    ...overrides,
  };
}

function makeRepo(overrides: Partial<TenantRepository> = {}): TenantRepository {
  return {
    async listMyCompanies() {
      return [];
    },
    async createCompany(name, slug) {
      return { id: COMPANY_ID, name, slug, role: "owner" } as CompanyWithRole;
    },
    async updateCompany() {},
    async getMyRole() {
      return "owner" as RoleCode;
    },
    async listMembers() {
      return { items: [], total: 0 };
    },
    async getMember() {
      return makeMember({});
    },
    async updateMemberRole() {},
    async removeMember() {},
    async leaveCompany() {},
    async definirResponsavel() {
      return [{ email: "pastor@igreja.org", afetado: true }];
    },
    ...overrides,
  };
}

describe("slugify", () => {
  it("converte nome com acentos e espaços em slug válido", () => {
    expect(slugify("Minha Empresa Ltda")).toBe("minha-empresa-ltda");
    expect(slugify("Ação & Cia!")).toBe("acao-cia");
    expect(slugify("---")).toBe("igreja");
  });
});

describe("tenantService.createCompany", () => {
  it("rejeita nome curto", async () => {
    const service = createTenantService(makeRepo());
    await expect(service.createCompany({ name: "a" })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("tenta sufixo aleatório quando o slug conflita", async () => {
    const slugs: string[] = [];
    const service = createTenantService(
      makeRepo({
        async createCompany(name, slug) {
          slugs.push(slug);
          if (slugs.length === 1) {
            throw new AppError("conflict", "slug em uso");
          }
          return { id: COMPANY_ID, name, slug, role: "owner" } as CompanyWithRole;
        },
      }),
    );
    const company = await service.createCompany({ name: "Minha Empresa" });
    expect(slugs[0]).toBe("minha-empresa");
    expect(slugs[1]).toMatch(/^minha-empresa-[a-z0-9]{4}$/);
    expect(company.slug).toBe(slugs[1]);
  });

  function repoQueGuarda(received: unknown[]) {
    return makeRepo({
      async createCompany(name, slug, church) {
        received.push(church);
        return { id: COMPANY_ID, name, slug, role: "owner" } as CompanyWithRole;
      },
    });
  }

  it("sem os campos novos, a igreja nasce sem complemento e fora de rede", async () => {
    const received: unknown[] = [];
    await createTenantService(repoQueGuarda(received)).createCompany({ name: "Igreja Esperança" });
    expect(received[0]).toEqual({ sobrenome: null, fazParteDeRede: false, redeNome: null, modulosInativos: [] });
  });

  it("guarda só os módulos desligáveis conhecidos que vieram desmarcados", async () => {
    const received: unknown[] = [];
    await createTenantService(repoQueGuarda(received)).createCompany({
      name: "Igreja Esperança",
      modulosInativos: ["ebd", "acompanhamento", "membros", "billing", "dashboard"],
    });
    // "membros", "billing" e "dashboard" não são desligáveis: descartados.
    expect(received[0]).toMatchObject({ modulosInativos: ["ebd", "acompanhamento"] });
  });

  it("limpa o complemento (espaços) e trata vazio como ausente", async () => {
    const received: unknown[] = [];
    const service = createTenantService(repoQueGuarda(received));
    await service.createCompany({ name: "Igreja Esperança", sobrenome: "  Vila Mariana   -  São Paulo " });
    await service.createCompany({ name: "Igreja Esperança", sobrenome: "   " });
    expect(received[0]).toMatchObject({ sobrenome: "Vila Mariana - São Paulo" });
    expect(received[1]).toMatchObject({ sobrenome: null });
  });

  it("grava o nome da rede só quando a igreja diz que faz parte de uma", async () => {
    const received: unknown[] = [];
    const service = createTenantService(repoQueGuarda(received));
    await service.createCompany({ name: "Igreja Esperança", fazParteDeRede: true, redeNome: " Ministério do Belém " });
    await service.createCompany({ name: "Igreja Esperança", fazParteDeRede: false, redeNome: "Ministério do Belém" });
    await service.createCompany({ name: "Igreja Esperança", fazParteDeRede: true, redeNome: "" });
    expect(received[0]).toMatchObject({ fazParteDeRede: true, redeNome: "Ministério do Belém" });
    expect(received[1]).toMatchObject({ fazParteDeRede: false, redeNome: null });
    expect(received[2]).toMatchObject({ fazParteDeRede: true, redeNome: null });
  });

  it("só aceita `true` de verdade como faz parte de rede (texto não vale)", async () => {
    const received: unknown[] = [];
    await createTenantService(repoQueGuarda(received)).createCompany({
      name: "Igreja Esperança",
      fazParteDeRede: "true",
      redeNome: "Ministério do Belém",
    });
    expect(received[0]).toMatchObject({ fazParteDeRede: false, redeNome: null });
  });

  it("rejeita complemento e nome de rede longos demais", async () => {
    const service = createTenantService(makeRepo());
    await expect(
      service.createCompany({ name: "Igreja Esperança", sobrenome: "x".repeat(121) }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      service.createCompany({ name: "Igreja Esperança", fazParteDeRede: true, redeNome: "x".repeat(121) }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("normalizePageParams (paginação)", () => {
  it("aplica defaults e calcula offset", () => {
    expect(normalizePageParams(undefined, 20)).toEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(normalizePageParams({ page: 3 }, 20)).toEqual({ page: 3, pageSize: 20, offset: 40 });
  });

  it("é defensivo com valores de query string inválidos", () => {
    expect(normalizePageParams({ page: 0 }, 20).page).toBe(1);
    expect(normalizePageParams({ page: -5 }, 20).page).toBe(1);
    expect(normalizePageParams({ page: NaN }, 20).page).toBe(1);
    expect(normalizePageParams({ pageSize: 10_000 }, 20).pageSize).toBe(100); // cap
    expect(normalizePageParams({ pageSize: 0 }, 20).pageSize).toBe(20);
  });
});

describe("tenantService.listMembers paginado", () => {
  it("repassa limit/offset ao repositório e devolve página com total", async () => {
    let received: { limit: number; offset: number } | undefined;
    const service = createTenantService(
      makeRepo({
        async listMembers(_companyId, opts) {
          received = opts;
          return { items: [makeMember({})], total: 45 };
        },
      }),
    );
    const result = await service.listMembers(COMPANY_ID, { page: 2 });
    expect(received).toEqual({ limit: 20, offset: 20 });
    expect(result).toMatchObject({ total: 45, page: 2, pageSize: 20 });
    expect(result.items).toHaveLength(1);
  });
});

describe("tenantService autorização", () => {
  it("bloqueia não-membro em operações da empresa", async () => {
    const service = createTenantService(makeRepo({ async getMyRole() { return null; } }));
    await expect(service.listMembers(COMPANY_ID)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.updateCompany(COMPANY_ID, { name: "Novo Nome" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member não pode editar empresa nem alterar papéis", async () => {
    const service = createTenantService(makeRepo({ async getMyRole() { return "member"; } }));
    await expect(
      service.updateCompany(COMPANY_ID, { name: "Novo Nome" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.changeMemberRole(COMPANY_ID, "m1", "admin"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("não permite promover ninguém a owner", async () => {
    const service = createTenantService(makeRepo());
    await expect(
      service.changeMemberRole(COMPANY_ID, "m1", "owner"),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("membro de outra empresa (id fora do tenant) vira not_found", async () => {
    const service = createTenantService(makeRepo({ async getMember() { return null; } }));
    await expect(
      service.changeMemberRole(COMPANY_ID, "m-de-outro-tenant", "admin"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("owner não pode sair da própria empresa", async () => {
    const service = createTenantService(makeRepo());
    await expect(service.leaveCompany(COMPANY_ID)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("admin não remove outro admin", async () => {
    const service = createTenantService(
      makeRepo({
        async getMyRole() {
          return "admin";
        },
        async getMember() {
          return makeMember({ role: "admin" });
        },
      }),
    );
    await expect(service.removeMember(COMPANY_ID, "m1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  describe("definirResponsavel", () => {
    it("um Responsável promove outro membro e recebe quem avisar", async () => {
      const chamadas: Array<[string, boolean]> = [];
      const service = createTenantService(
        makeRepo({
          async getMember() {
            return makeMember({ role: "admin" });
          },
          async definirResponsavel(memberId, tornar) {
            chamadas.push([memberId, tornar]);
            return [{ email: "novo@igreja.org", afetado: true }];
          },
        }),
      );
      const r = await service.definirResponsavel(COMPANY_ID, "m1", true);
      expect(chamadas).toEqual([["m1", true]]);
      expect(r.avisar).toEqual([{ email: "novo@igreja.org", afetado: true }]);
    });

    it("administrador não define Responsável, nem a si mesmo", async () => {
      let chamou = false;
      const service = createTenantService(
        makeRepo({
          async getMyRole() {
            return "admin";
          },
          async getMember() {
            return makeMember({ role: "admin" });
          },
          async definirResponsavel() {
            chamou = true;
            return [];
          },
        }),
      );
      await expect(service.definirResponsavel(COMPANY_ID, "m1", true)).rejects.toMatchObject({ code: "forbidden" });
      expect(chamou).toBe(false);
    });

    it("membro de outra igreja vira not_found", async () => {
      const service = createTenantService(
        makeRepo({
          async getMember() {
            return null;
          },
        }),
      );
      await expect(service.definirResponsavel(COMPANY_ID, "de-fora", true)).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("não promove quem já é, nem tira de quem não é", async () => {
      const dono = createTenantService(
        makeRepo({
          async getMember() {
            return makeMember({ role: "owner" });
          },
        }),
      );
      await expect(dono.definirResponsavel(COMPANY_ID, "m1", true)).rejects.toMatchObject({
        code: "validation_error",
      });
      const comum = createTenantService(
        makeRepo({
          async getMember() {
            return makeMember({ role: "member" });
          },
        }),
      );
      await expect(comum.definirResponsavel(COMPANY_ID, "m1", false)).rejects.toMatchObject({
        code: "validation_error",
      });
    });
  });
});
