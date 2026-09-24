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
});
