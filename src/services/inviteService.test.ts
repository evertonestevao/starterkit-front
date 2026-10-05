import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import type { CompanyInvite, CompanyMember } from "@/types/database";
import {
  createInviteService,
  linkDeAceite,
  type InviteRepository,
} from "./inviteService";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";

function makeInvite(overrides: Partial<CompanyInvite>): CompanyInvite {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    company_id: COMPANY_ID,
    email: "novo@test.com",
    role: "member",
    invited_by: USER_ID,
    token: TOKEN,
    status: "pending",
    expires_at: "",
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeRepo(overrides: Partial<InviteRepository> = {}): InviteRepository {
  return {
    async createInvite(data) {
      return makeInvite({ email: data.email, role: data.role });
    },
    async revokeInvite() {},
    async listPending() {
      return [];
    },
    async listMyPending() {
      return [];
    },
    async acceptInvite() {
      return { id: "m1" } as CompanyMember;
    },
    ...overrides,
  };
}

function makeService(deps: Partial<Parameters<typeof createInviteService>[0]> = {}) {
  return createInviteService({
    repo: makeRepo(),
    rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
    ...deps,
  });
}

describe("inviteService.invite", () => {
  it("cria convite com email normalizado para minúsculas", async () => {
    let created: { email: string } | undefined;
    const service = makeService({
      repo: makeRepo({
        async createInvite(data) {
          created = data;
          return makeInvite({ email: data.email });
        },
      }),
    });
    await service.invite({
      companyId: COMPANY_ID,
      email: "Novo@Test.COM",
      role: "member",
      invitedBy: USER_ID,
    });
    expect(created?.email).toBe("novo@test.com");
  });

  it("rejeita email inválido e role owner", async () => {
    const service = makeService();
    await expect(
      service.invite({ companyId: COMPANY_ID, email: "x", role: "member", invitedBy: USER_ID }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      service.invite({
        companyId: COMPANY_ID,
        email: "a@b.com",
        // @ts-expect-error owner não é convidável — validado em runtime também
        role: "owner",
        invitedBy: USER_ID,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("aplica rate limit por convidador na empresa", async () => {
    let clock = 0;
    const service = makeService({
      rateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => clock }),
    });
    const input = {
      companyId: COMPANY_ID,
      email: "a@b.com",
      role: "member" as const,
      invitedBy: USER_ID,
    };
    await service.invite(input);
    await service.invite(input);
    await expect(service.invite(input)).rejects.toMatchObject({ code: "rate_limited" });

    clock = 1001; // janela expirou: volta a aceitar
    await expect(service.invite(input)).resolves.toBeDefined();
  });

  it("notifica por email e registra auditoria quando presentes", async () => {
    const sent: CompanyInvite[] = [];
    const audited: string[] = [];
    const service = makeService({
      notifier: {
        async sendInviteEmail(invite) {
          sent.push(invite);
        },
      },
      audit: {
        async record(entry) {
          audited.push(entry.action);
        },
        async listRecent() {
          return { items: [], total: 0, page: 1, pageSize: 20 };
        },
      },
    });
    await service.invite({
      companyId: COMPANY_ID,
      email: "a@b.com",
      role: "admin",
      invitedBy: USER_ID,
    });
    expect(sent).toHaveLength(1);
    expect(audited).toEqual(["member.invited"]);
  });

  it("se o e-mail falha, o convite fica criado e a mensagem diz o que fazer", async () => {
    const criados: string[] = [];
    const audited: string[] = [];
    const service = makeService({
      repo: makeRepo({
        async createInvite(data) {
          criados.push(data.email);
          return makeInvite({ email: data.email, role: data.role });
        },
      }),
      notifier: {
        async sendInviteEmail() {
          throw new AppError("email_error", "Falha ao enviar email", { status: 403 });
        },
      },
      audit: {
        async record(entry) {
          audited.push(entry.action);
        },
        async listRecent() {
          return { items: [], total: 0, page: 1, pageSize: 20 };
        },
      },
    });
    const err = await service
      .invite({ companyId: COMPANY_ID, email: "a@b.com", role: "member", invitedBy: USER_ID })
      .catch((e) => e);
    expect(err).toMatchObject({ code: "email_error" });
    expect(String(err.message)).toContain("Reenviar e-mail");
    expect(String(err.message)).toContain("Copiar link");
    // O convite existe e foi auditado mesmo sem o e-mail.
    expect(criados).toEqual(["a@b.com"]);
    expect(audited).toEqual(["member.invited"]);
  });
});

describe("inviteService: reenviar e link do convite", () => {
  const INVITE_ID = "44444444-4444-4444-8444-444444444444";
  const pendente = () => makeRepo({ listPending: async () => [makeInvite({ id: INVITE_ID, email: "a@b.com" })] });

  it("reenvia o e-mail de um convite pendente e registra", async () => {
    const sent: string[] = [];
    const audited: string[] = [];
    const service = makeService({
      repo: pendente(),
      notifier: {
        async sendInviteEmail(invite) {
          sent.push(invite.email);
        },
      },
      audit: {
        async record(entry) {
          audited.push(entry.action);
        },
        async listRecent() {
          return { items: [], total: 0, page: 1, pageSize: 20 };
        },
      },
    });
    await expect(service.resend(INVITE_ID, COMPANY_ID, USER_ID)).resolves.toMatchObject({ email: "a@b.com" });
    expect(sent).toEqual(["a@b.com"]);
    expect(audited).toEqual(["invite.resent"]);
  });

  it("convite que não está mais pendente (aceito, cancelado, de outra igreja) não reenvia nem dá link", async () => {
    const sent: string[] = [];
    const service = makeService({
      notifier: {
        async sendInviteEmail(invite) {
          sent.push(invite.email);
        },
      },
    });
    await expect(service.resend(INVITE_ID, COMPANY_ID, USER_ID)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.tokenDoConvite(INVITE_ID, COMPANY_ID)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.tokenDoConvite("xpto", COMPANY_ID)).rejects.toMatchObject({ code: "validation_error" });
    expect(sent).toEqual([]);
  });

  it("reenviar conta no mesmo limite de quem convida", async () => {
    const service = makeService({
      repo: pendente(),
      rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    await service.resend(INVITE_ID, COMPANY_ID, USER_ID);
    await expect(service.resend(INVITE_ID, COMPANY_ID, USER_ID)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("devolve o token do convite pendente e monta o mesmo link do e-mail", async () => {
    const service = makeService({ repo: pendente() });
    const { token, email } = await service.tokenDoConvite(INVITE_ID, COMPANY_ID);
    expect(email).toBe("a@b.com");
    expect(linkDeAceite("https://app.example.com/", token)).toBe(
      `https://app.example.com/invites/accept?token=${token}`,
    );
  });
});

describe("inviteService.accept", () => {
  it("rejeita token que não é uuid sem tocar o repositório", async () => {
    const service = makeService({
      repo: makeRepo({
        async acceptInvite() {
          throw new Error("não deveria ser chamado");
        },
      }),
    });
    await expect(service.accept("token-forjado")).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("aceita token válido via repositório (RPC)", async () => {
    const service = makeService();
    await expect(service.accept(TOKEN)).resolves.toMatchObject({ id: "m1" });
  });
});
