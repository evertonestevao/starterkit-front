import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/types/database";
import {
  createAuditService,
  sanitizeMetadata,
  type AuditRepository,
  type NewAuditEntry,
} from "./auditService";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeRepo(inserted: NewAuditEntry[]): AuditRepository {
  return {
    async insert(entry) {
      inserted.push(entry);
    },
    async listByCompany() {
      return [] as AuditLog[];
    },
  };
}

describe("sanitizeMetadata", () => {
  it("remove chaves sensíveis em qualquer nível", () => {
    expect(
      sanitizeMetadata({
        plan: "pro",
        password: "x",
        api_key: "x",
        Authorization: "Bearer x",
        card_number: "4242",
        nested: { token: "x", ok: 1, deep: { cvv: "123", keep: true } },
      }),
    ).toEqual({ plan: "pro", nested: { ok: 1, deep: { keep: true } } });
  });

  it("preserva metadata sem chaves sensíveis", () => {
    const meta = { entity: "member", role: "admin", count: 3 };
    expect(sanitizeMetadata(meta)).toEqual(meta);
  });
});

describe("auditService.record", () => {
  it("grava entrada válida com metadata sanitizado", async () => {
    const inserted: NewAuditEntry[] = [];
    const service = createAuditService(makeRepo(inserted));
    await service.record({
      companyId: COMPANY_ID,
      userId: USER_ID,
      action: "member.invited",
      metadata: { email_domain: "test.com", token: "secreto" },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].action).toBe("member.invited");
    expect(inserted[0].metadata).toEqual({ email_domain: "test.com" });
  });

  it("aceita userId null para eventos de sistema", async () => {
    const inserted: NewAuditEntry[] = [];
    const service = createAuditService(makeRepo(inserted));
    await service.record({
      companyId: COMPANY_ID,
      userId: null,
      action: "subscription.activated",
    });
    expect(inserted[0].userId).toBeNull();
  });

  it("rejeita companyId inválido e action vazia", async () => {
    const service = createAuditService(makeRepo([]));
    await expect(
      service.record({ companyId: "não-é-uuid", userId: null, action: "x" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      service.record({ companyId: COMPANY_ID, userId: null, action: "" }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});
