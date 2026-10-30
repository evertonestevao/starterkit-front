import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/server/supabase-server", () => ({
  getSupabaseServerClient: async () => ({ rpc, from, auth: { getUser } }),
}));
vi.mock("@/server/supabase-admin", () => ({
  getSupabaseAdminClient: () => {
    throw new Error("service_role não pode ser usado sem autorização");
  },
}));
vi.mock("@/adapters/errorReporting", () => ({ reportError: vi.fn() }));
vi.mock("@/adapters/email", () => ({ getEmailProvider: () => ({ send: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const actions = await import("./actions");

/** Dados válidos: o bloqueio tem de vir do papel, não da validação do formulário. */
function validForm() {
  const form = new FormData();
  const id = "11111111-1111-4111-8111-111111111111";
  form.set("id", id);
  form.append("ids", id);
  form.set("name", "Maria");
  form.set("email", "maria@example.com");
  form.set("referralCode", "maria");
  form.set("status", "suspended");
  form.set("commissionType", "percent");
  form.set("value", "30");
  form.set("amount", "10");
  form.set("paidAt", "2026-10-30");
  form.set("enabled", "true");
  form.set("available", "true");
  return form;
}

const exported = Object.entries(actions) as Array<
  [string, (prev: undefined, form: FormData) => Promise<{ error?: string; success?: string }>]
>;

describe("ações do painel: só o super admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("cobre todas as ações do arquivo", () => {
    expect(exported.length).toBeGreaterThanOrEqual(11);
  });

  it.each(exported)("%s recusa quem não é super admin", async (_name, action) => {
    rpc.mockResolvedValue({ data: false, error: null });
    const result = await action(undefined, validForm());
    expect(result.error).toMatch(/super admin/);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("is_super_admin");
  });

  it.each(exported)("%s recusa quando a checagem do papel falha", async (_name, action) => {
    rpc.mockResolvedValue({ data: null, error: { message: "fora do ar" } });
    const result = await action(undefined, validForm());
    expect(result.error).toMatch(/super admin/);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(exported)("%s recusa sem sessão, mesmo se o papel responder true", async (_name, action) => {
    getUser.mockResolvedValue({ data: { user: null } });
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await action(undefined, validForm());
    expect(result.error).toMatch(/super admin/);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("validação no servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("percentual acima de 100 é recusado", async () => {
    const form = validForm();
    form.set("value", "101");
    const result = await actions.createCommissionRuleAction(undefined, form);
    expect(result.error).toMatch(/entre 0 e 100/);
    expect(from).not.toHaveBeenCalled();
  });

  it("marcar como pago exige seleção e data", async () => {
    const form = new FormData();
    form.set("paidAt", "2026-10-30");
    const result = await actions.markCommissionsPaidAction(undefined, form);
    expect(result.error).toMatch(/Selecione/);
  });

  it("código de indicação malformado é recusado", async () => {
    const form = validForm();
    form.set("referralCode", "a b;c");
    const result = await actions.updateResellerAction(undefined, form);
    expect(result.error).toMatch(/Código/);
  });
});
