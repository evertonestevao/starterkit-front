import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { AccountMembership } from "@/types/account";
import {
  createAccountService,
  planAccountDeletion,
  type AccountAuditor,
  type AccountRemover,
  type AccountRepository,
} from "./accountService";

const USER = { id: "u1", email: "ana@example.com", createdAt: "2026-01-01T00:00:00Z" };

function membership(overrides: Partial<AccountMembership>): AccountMembership {
  return {
    companyId: "c1",
    companyName: "Empresa 1",
    role: "member",
    activeMembers: 3,
    subscriptionStatus: null,
    ...overrides,
  };
}

const noLimit: RateLimiter = { async consume() {} };

function setup(memberships: AccountMembership[], overrides: Partial<AccountRepository> = {}) {
  const closed: string[] = [];
  const audited: string[] = [];
  const deleted: string[] = [];
  const repo: AccountRepository = {
    async getCurrentUser() {
      return USER;
    },
    async listMyMemberships() {
      return memberships;
    },
    async closeCompany(companyId) {
      closed.push(companyId);
    },
    async collectMyData() {
      return { profile: null, memberships: [], termsAcceptances: [], consents: [] };
    },
    ...overrides,
  };
  const remover: AccountRemover = {
    async deleteUser(userId) {
      deleted.push(userId);
    },
  };
  const audit: AccountAuditor = {
    async record(entry) {
      audited.push(`${entry.companyId}:${entry.action}`);
    },
  };
  const service = createAccountService({
    repo,
    remover,
    audit,
    rateLimiter: noLimit,
    now: () => new Date("2026-10-26T12:00:00Z"),
  });
  return { service, closed, audited, deleted };
}

describe("planAccountDeletion", () => {
  it("bloqueia owner de empresa com outros membros", () => {
    const plan = planAccountDeletion([membership({ role: "owner", activeMembers: 2 })]);
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0]).toContain("Transfira");
  });

  it("bloqueia owner único com assinatura ativa", () => {
    const plan = planAccountDeletion([
      membership({ role: "owner", activeMembers: 1, subscriptionStatus: "active" }),
    ]);
    expect(plan.blockers[0]).toContain("Cancele a assinatura");
  });

  it("encerra empresa só do usuário e sai das demais", () => {
    const plan = planAccountDeletion([
      membership({
        companyId: "c1",
        role: "owner",
        activeMembers: 1,
        subscriptionStatus: "canceled",
      }),
      membership({ companyId: "c2", role: "admin" }),
    ]);
    expect(plan.blockers).toEqual([]);
    expect(plan.companiesToClose.map((m) => m.companyId)).toEqual(["c1"]);
    expect(plan.companiesToLeave.map((m) => m.companyId)).toEqual(["c2"]);
  });
});

describe("deleteMyAccount", () => {
  it("exige o email do próprio usuário como confirmação", async () => {
    const { service, deleted } = setup([]);
    await expect(
      service.deleteMyAccount({ confirmation: "outro@example.com" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(deleted).toEqual([]);
  });

  it("não exclui nada quando há bloqueio", async () => {
    const { service, deleted, closed } = setup([membership({ role: "owner", activeMembers: 2 })]);
    await expect(service.deleteMyAccount({ confirmation: USER.email })).rejects.toBeInstanceOf(
      AppError,
    );
    expect(deleted).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("audita, encerra empresas próprias e exclui o usuário", async () => {
    const { service, deleted, closed, audited } = setup([
      membership({ companyId: "c1", role: "owner", activeMembers: 1 }),
      membership({ companyId: "c2", role: "member" }),
    ]);
    await service.deleteMyAccount({ confirmation: "  ANA@example.com " });
    expect(audited).toEqual(["c2:member.account_deleted", "c1:company.closed"]);
    expect(closed).toEqual(["c1"]);
    expect(deleted).toEqual(["u1"]);
  });

  it("sem sessão lança unauthorized", async () => {
    const { service } = setup([], {
      async getCurrentUser() {
        return null;
      },
    });
    await expect(service.deleteMyAccount({ confirmation: USER.email })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("exportMyData", () => {
  it("inclui conta e data de exportação", async () => {
    const { service } = setup([]);
    const data = await service.exportMyData();
    expect(data.account).toEqual(USER);
    expect(data.exportedAt).toBe("2026-10-26T12:00:00.000Z");
  });
});
