import { describe, expect, it, vi } from "vitest";
import type { RecurringBillingProvider } from "@/adapters/payment/RecurringBillingProvider";
import { isAppError } from "@/lib/errors";
import type {
  BillingWebhookEvent,
  SponsorAccount,
  SponsorCharge,
  Sponsorship,
  SponsorshipWithChurch,
} from "@/types/sponsorship";
import type { PriceTier } from "./sponsorPricing";
import {
  createSponsorService,
  type ChargeUpsert,
  type SponsorAuditEntry,
  type SponsorBillingStore,
  type SponsorRepository,
} from "./sponsorService";

const TIERS: PriceTier[] = [
  { position: 1, amountCents: 3990 },
  { position: 2, amountCents: 3490 },
  { position: 3, amountCents: 2990 },
  { position: 4, amountCents: 2790 },
];

const USER = { userId: "user-1", email: "patrocinador@exemplo.com" };
const CHURCHES: Record<string, { name: string; code: string; companyId: string }> = {
  "00000000-0000-4000-8000-00000000000a": { name: "Igreja A", code: "a", companyId: "co-a" },
  "00000000-0000-4000-8000-00000000000b": { name: "Igreja B", code: "b", companyId: "co-b" },
  "00000000-0000-4000-8000-00000000000c": { name: "Igreja C", code: "c", companyId: "co-c" },
};
const [A, B, C] = Object.keys(CHURCHES);

/**
 * Banco em memória com o MESMO comportamento das RPCs da migration:
 * status inicial decidido pela cobrança, cancelamento agendado, unicidade.
 */
function makeWorld(
  options: {
    providerFails?: Partial<Record<keyof RecurringBillingProvider, boolean>>;
    /** Simula o provedor recusando gerar link para email sem conta. */
    accessLinkFailsFor?: string;
    publicLimiter?: { consume: (key: string) => Promise<void> };
  } = {},
) {
  let clock = new Date("2026-09-17T15:00:00Z");
  let seq = 0;
  // UUID de verdade: o service valida o formato dos ids que chegam do client.
  const id = () => {
    seq += 1;
    return `10000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  };
  const tick = () => {
    clock = new Date(clock.getTime() + 60_000);
    return clock.toISOString();
  };

  let account: SponsorAccount | null = null;
  const sponsorships: Sponsorship[] = [];
  const charges: SponsorCharge[] = [];
  const items: Array<{ chargeId: string; sponsorshipId: string; position: number; amountCents: number }> = [];
  const audits: SponsorAuditEntry[] = [];
  const termsAccepted: Array<{ userId: string; emailConsent: boolean; ip: string | null }> = [];
  const emailsSent: Array<{ to: string; url: string; isNewSponsor: boolean }> = [];
  const existingEmails = new Set<string>();

  const providerCalls: Array<{ op: string; args: unknown[] }> = [];
  const pendingWebhooks: BillingWebhookEvent[] = [];

  function makeProvider(name: string, autoPay: boolean): RecurringBillingProvider {
    const guard = (op: keyof RecurringBillingProvider) => {
      if (options.providerFails?.[op]) throw new Error(`${op} falhou`);
    };
    return {
      name,
      async createCustomer(input) {
        guard("createCustomer");
        providerCalls.push({ op: "createCustomer", args: [input] });
        return { customerId: `${name}-cus` };
      },
      async createSubscription(input) {
        guard("createSubscription");
        providerCalls.push({ op: "createSubscription", args: [input] });
        const subscriptionId = `${name}-sub-${id()}`;
        const event: BillingWebhookEvent = {
          kind: "charge",
          provider: name,
          charge: {
            paymentId: id(),
            subscriptionId,
            amountCents: input.amountCents,
            dueDate: input.nextDueDate,
            status: autoPay ? "paid" : "pending",
            paidAt: autoPay ? clock.toISOString() : null,
            invoiceUrl: autoPay ? null : "https://pagar.exemplo/1",
          },
        };
        return {
          subscriptionId,
          firstInvoiceUrl: autoPay ? null : "https://pagar.exemplo/1",
          immediateEvents: autoPay ? [event] : undefined,
        };
      },
      async updateSubscriptionAmount(subscriptionId, amountCents) {
        guard("updateSubscriptionAmount");
        providerCalls.push({ op: "update", args: [subscriptionId, amountCents] });
      },
      async cancelSubscription(subscriptionId) {
        guard("cancelSubscription");
        providerCalls.push({ op: "cancel", args: [subscriptionId] });
      },
      async parseWebhook() {
        return pendingWebhooks.shift() ?? { kind: "ignored", provider: name };
      },
    };
  }

  let defaultProvider = "fake";
  const providers: Record<string, RecurringBillingProvider> = {
    fake: makeProvider("fake", true),
    manual: makeProvider("manual", false),
  };

  const withChurch = (s: Sponsorship): SponsorshipWithChurch => ({
    ...s,
    church_name: CHURCHES[s.church_id].name,
    church_public_code: CHURCHES[s.church_id].code,
  });

  const repo: SponsorRepository = {
    async getMyAccount() {
      return account;
    },
    async createMyAccount(input) {
      account = {
        id: "acc-1",
        user_id: input.userId,
        kind: input.kind,
        display_name: input.displayName,
        email: input.email,
        phone: input.phone,
        document: input.document,
        logo_url: null,
        gateway: null,
        gateway_customer_id: null,
        gateway_subscription_id: null,
        billing_status: "none",
        billed_amount_cents: null,
        billing_sync_status: "synced",
        billing_synced_at: null,
        next_due_date: null,
        deleted_at: null,
        created_at: clock.toISOString(),
        updated_at: clock.toISOString(),
      };
      return account;
    },
    async updateMyAccount(input) {
      if (account) account = { ...account, display_name: input.displayName, phone: input.phone };
    },
    async listMySponsorships() {
      return sponsorships.map(withChurch);
    },
    async listMyCharges() {
      return [...charges].sort((x, y) => y.due_date.localeCompare(x.due_date));
    },
    async requestSponsorship(churchId) {
      if (!account) throw new Error("sem conta");
      if (account.billing_status === "overdue") throw new Error("pagamento pendente");
      const live = sponsorships.find(
        (s) => s.church_id === churchId && s.status !== "canceled",
      );
      if (live) throw new Error("duplicado");
      const createdAt = tick();
      const active = account.billing_status === "active";
      const row: Sponsorship = {
        id: id(),
        sponsor_id: account.id,
        church_id: churchId,
        company_id: CHURCHES[churchId].companyId,
        status: active ? "active" : "pending_payment",
        activated_at: active ? createdAt : null,
        cancel_requested_at: null,
        ends_at: null,
        canceled_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      sponsorships.push(row);
      return row;
    },
    async cancelSponsorship(sponsorshipId) {
      const row = sponsorships.find((s) => s.id === sponsorshipId && s.sponsor_id === account?.id);
      if (!row) throw new Error("não encontrado");
      const at = tick();
      if (row.status === "pending_payment") {
        Object.assign(row, { status: "canceled", canceled_at: at, ends_at: at, cancel_requested_at: at });
      } else if (row.status === "active") {
        Object.assign(row, {
          status: "cancel_scheduled",
          cancel_requested_at: at,
          ends_at: account?.next_due_date ? `${account.next_due_date}T00:00:00.000Z` : at,
        });
      }
      return { ...row };
    },
    async listPriceTiers() {
      return TIERS;
    },
    async findPublicChurch(code) {
      const entry = Object.entries(CHURCHES).find(([, c]) => c.code === code);
      return entry ? { id: entry[0], name: entry[1].name, publicCode: code, hasOwner: true } : null;
    },
  };

  const store: SponsorBillingStore = {
    async getAccount() {
      return account;
    },
    async findAccountBySubscription(gateway, subscriptionId) {
      return account?.gateway === gateway && account.gateway_subscription_id === subscriptionId
        ? account
        : null;
    },
    async updateAccountBilling(_id, patch) {
      if (account) account = { ...account, ...patch } as SponsorAccount;
    },
    async listBillableSponsorships() {
      return sponsorships
        .filter((s) => s.status === "active" || s.status === "pending_payment")
        .map((s) => ({ id: s.id, church_id: s.church_id, company_id: s.company_id, status: s.status, created_at: s.created_at }));
    },
    async activatePendingSponsorships(_id, at) {
      let n = 0;
      for (const s of sponsorships) {
        if (s.status === "pending_payment") {
          Object.assign(s, { status: "active", activated_at: at });
          n += 1;
        }
      }
      return n;
    },
    async finalizeEndedCancellations(nowIso) {
      let n = 0;
      for (const s of sponsorships) {
        if (s.status === "cancel_scheduled" && s.ends_at && s.ends_at <= nowIso) {
          Object.assign(s, { status: "canceled", canceled_at: nowIso });
          n += 1;
        }
      }
      return n;
    },
    async discardPendingSponsorship(sponsorshipId, at) {
      const row = sponsorships.find((s) => s.id === sponsorshipId);
      if (row) Object.assign(row, { status: "canceled", canceled_at: at, ends_at: at });
    },
    async upsertCharge(input: ChargeUpsert) {
      const existing = charges.find(
        (c) => c.gateway === input.gateway && c.gateway_payment_id === input.gatewayPaymentId,
      );
      if (existing) {
        Object.assign(existing, {
          amount_cents: input.amountCents,
          status: input.status,
          paid_at: input.paidAt,
          invoice_url: input.invoiceUrl,
          due_date: input.dueDate,
        });
        return { charge: existing, created: false };
      }
      const charge: SponsorCharge = {
        id: id(),
        sponsor_id: input.sponsorId,
        gateway: input.gateway,
        gateway_payment_id: input.gatewayPaymentId,
        amount_cents: input.amountCents,
        active_count: input.activeCount,
        due_date: input.dueDate,
        paid_at: input.paidAt,
        status: input.status,
        invoice_url: input.invoiceUrl,
        created_at: clock.toISOString(),
      };
      charges.push(charge);
      return { charge, created: true };
    },
    async countChargeItems(chargeId) {
      return items.filter((i) => i.chargeId === chargeId).length;
    },
    async insertChargeItems(rows) {
      items.push(...rows.map((r) => ({ chargeId: r.chargeId, sponsorshipId: r.sponsorshipId, position: r.position, amountCents: r.amountCents })));
    },
    async listAccountsNeedingSync() {
      return account && account.billing_sync_status !== "synced" ? [account.id] : [];
    },
    async listPriceTiers() {
      return TIERS;
    },
    async findAccountByEmail(email) {
      return account && account.email === email ? account : null;
    },
    async findChurchByPublicCode(code) {
      const entry = Object.entries(CHURCHES).find(([, ch]) => ch.code === code);
      if (!entry) return null;
      return {
        id: entry[0],
        name: entry[1].name,
        publicCode: code,
        address: null,
        logoUrl: null,
        companyId: entry[1].companyId,
      };
    },
    async createAccountForUser(input) {
      account = {
        id: "acc-1",
        user_id: input.userId,
        kind: input.kind,
        display_name: input.displayName,
        email: input.email,
        phone: input.phone,
        document: input.document,
        logo_url: null,
        gateway: null,
        gateway_customer_id: null,
        gateway_subscription_id: null,
        billing_status: "none",
        billed_amount_cents: null,
        billing_sync_status: "synced",
        billing_synced_at: null,
        next_due_date: null,
        deleted_at: null,
        created_at: clock.toISOString(),
        updated_at: clock.toISOString(),
      };
      return account;
    },
    async createSponsorshipForAccount(accountId, churchId, companyId) {
      const createdAt = tick();
      const isActive = account?.billing_status === "active";
      const row: Sponsorship = {
        id: id(),
        sponsor_id: accountId,
        church_id: churchId,
        company_id: companyId,
        status: isActive ? "active" : "pending_payment",
        activated_at: isActive ? createdAt : null,
        cancel_requested_at: null,
        ends_at: null,
        canceled_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      sponsorships.push(row);
      return row;
    },
    async recordTermsAcceptance(userId, evidence, emailConsent) {
      termsAccepted.push({ userId, emailConsent, ip: evidence.ipAddress });
    },
  };

  const log = { warn: vi.fn(), error: vi.fn() };
  const service = createSponsorService({
    repo,
    store,
    resolveProvider: (name) => providers[name ?? defaultProvider],
    defaultProviderName: () => defaultProvider,
    appUrl: "https://app.exemplo",
    identity: {
      async createPasswordlessUser({ email }) {
        if (existingEmails.has(email)) return { userId: null, alreadyExists: true };
        existingEmails.add(email);
        return { userId: `user-${email}`, alreadyExists: false };
      },
      async createAccessLink(email, nextPath) {
        if (options.accessLinkFailsFor === email) {
          throw new Error("User not found");
        }
        return `https://app.exemplo/auth/confirm?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`;
      },
    },
    mailer: {
      async sendAccessLink(input) {
        emailsSent.push({ to: input.to, url: input.url, isNewSponsor: input.isNewSponsor });
      },
    },
    publicRateLimiter: options.publicLimiter,
    audit: async (entry) => {
      audits.push(entry);
    },
    now: () => clock,
    log,
  });

  return {
    service,
    get account() {
      return account;
    },
    sponsorships,
    charges,
    items,
    audits,
    termsAccepted,
    emailsSent,
    existingEmails,
    providerCalls,
    log,
    setDefaultProvider(name: string) {
      defaultProvider = name;
    },
    advanceTo(iso: string) {
      clock = new Date(iso);
    },
  };
}

async function signUp(world: ReturnType<typeof makeWorld>) {
  await world.service.createAccount(
    { kind: "person", displayName: "Maria Souza", document: "529.982.247-25", phone: "(11) 98888-7777" },
    USER,
  );
}

const lastUpdateAmount = (world: ReturnType<typeof makeWorld>) =>
  [...world.providerCalls].reverse().find((c) => c.op === "update")?.args[1];

describe("cadastro", () => {
  it("normaliza documento e telefone e usa o e-mail do login", async () => {
    const world = makeWorld();
    await signUp(world);
    expect(world.account).toMatchObject({
      document: "52998224725",
      phone: "11988887777",
      email: USER.email,
    });
  });

  it("recusa documento que não bate com o tipo", async () => {
    const world = makeWorld();
    await expect(
      world.service.createAccount(
        { kind: "business", displayName: "Padaria", document: "52998224725", phone: "" },
        USER,
      ),
    ).rejects.toThrow(/CNPJ inválido/);
  });

  it("não deixa cadastrar duas vezes", async () => {
    const world = makeWorld();
    await signUp(world);
    await expect(signUp(world)).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "conflict",
    );
  });
});

describe("primeiro patrocínio", () => {
  it("cria cliente e assinatura com o tier 1 e ativa quando a fatura é paga", async () => {
    const world = makeWorld();
    await signUp(world);
    const result = await world.service.startSponsorship(A, USER);

    expect(world.providerCalls.find((c) => c.op === "createSubscription")?.args[0]).toMatchObject({
      amountCents: 3990,
      nextDueDate: "2026-09-17",
    });
    // Fake paga na hora: o pendente vira ativo e a cobrança ganha snapshot.
    expect(world.sponsorships[0].status).toBe("active");
    expect(world.account).toMatchObject({
      billing_status: "active",
      billed_amount_cents: 3990,
      next_due_date: "2026-10-17",
    });
    expect(world.charges).toHaveLength(1);
    expect(world.items).toEqual([
      expect.objectContaining({ position: 1, amountCents: 3990 }),
    ]);
    expect(result.billingSyncPending).toBe(false);
    expect(world.audits[0]).toMatchObject({ companyId: "co-a", action: "sponsorship.started" });
  });

  it("com provedor que exige pagamento, devolve o link e fica pendente", async () => {
    const world = makeWorld();
    world.setDefaultProvider("manual");
    await signUp(world);
    const result = await world.service.startSponsorship(A, USER);

    expect(result.invoiceUrl).toBe("https://pagar.exemplo/1");
    expect(world.sponsorships[0].status).toBe("pending_payment");

    // Como no Asaas: a cobrança chega por webhook logo depois da criação, e é
    // ela que mantém o link de pagamento acessível pelo painel.
    await world.service.applyBillingEvent({
      kind: "charge",
      provider: "manual",
      charge: {
        paymentId: "pay-primeira",
        subscriptionId: world.account!.gateway_subscription_id,
        amountCents: 3990,
        dueDate: "2026-09-17",
        status: "pending",
        paidAt: null,
        invoiceUrl: "https://pagar.exemplo/1",
      },
    });
    expect(world.sponsorships[0].status).toBe("pending_payment");
    const overview = await world.service.getOverview();
    expect(overview.paymentState).toBe("pendente");
    expect(overview.openInvoiceUrl).toBe("https://pagar.exemplo/1");
  });

  it("se o provedor recusar, o pedido é desfeito", async () => {
    const world = makeWorld({ providerFails: { createSubscription: true } });
    await signUp(world);
    await expect(world.service.startSponsorship(A, USER)).rejects.toThrow();
    expect(world.sponsorships[0].status).toBe("canceled");
  });

  it("exige cadastro completo", async () => {
    const world = makeWorld();
    await expect(world.service.startSponsorship(A, USER)).rejects.toThrow(/cadastro/);
  });
});

describe("recálculo por posição — cenário do enunciado", () => {
  async function threeChurches() {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    await world.service.startSponsorship(B, USER);
    await world.service.startSponsorship(C, USER);
    return world;
  }

  it("adicionar igrejas atualiza UMA assinatura com o total acumulado", async () => {
    const world = await threeChurches();
    const creates = world.providerCalls.filter((c) => c.op === "createSubscription");
    const updates = world.providerCalls.filter((c) => c.op === "update").map((c) => c.args[1]);
    expect(creates).toHaveLength(1);
    expect(updates).toEqual([7480, 10470]);
    // Cobrança em dia: igreja nova entra ativa na hora.
    expect(world.sponsorships.map((s) => s.status)).toEqual(["active", "active", "active"]);
  });

  it("lista cada igreja com o valor da sua posição atual", async () => {
    const world = await threeChurches();
    const list = await world.service.listSponsorships();
    expect(list.map((s) => [s.churchName, s.position, s.currentAmountCents])).toEqual([
      ["Igreja A", 1, 3990],
      ["Igreja B", 2, 3490],
      ["Igreja C", 3, 2990],
    ]);
    expect((await world.service.getOverview()).monthlyTotalCents).toBe(10470);
  });

  it("cancelar A cobra posição 1 + 2 (74,80), não B + C antigos (64,80)", async () => {
    const world = await threeChurches();
    const spA = world.sponsorships.find((s) => s.church_id === A)!;

    await world.service.cancelSponsorship(spA.id, USER);

    expect(lastUpdateAmount(world)).toBe(7480);
    expect(world.account?.billed_amount_cents).toBe(7480);

    const list = await world.service.listSponsorships();
    expect(list.map((s) => [s.churchName, s.status, s.currentAmountCents])).toEqual([
      ["Igreja B", "active", 3990],
      ["Igreja C", "active", 3490],
      // A segue visível até o fim do ciclo pago, mas fora da cobrança.
      ["Igreja A", "cancel_scheduled", null],
    ]);
    expect(spA.ends_at).toBe("2026-10-17T00:00:00.000Z");
    expect((await world.service.getOverview()).monthlyTotalCents).toBe(7480);
    expect(world.audits.at(-1)).toMatchObject({ companyId: "co-a", action: "sponsorship.canceled" });
  });

  it("na virada do ciclo, o cancelado sai e o snapshot usa os tiers 1 e 2", async () => {
    const world = await threeChurches();
    const spA = world.sponsorships.find((s) => s.church_id === A)!;
    await world.service.cancelSponsorship(spA.id, USER);

    world.advanceTo("2026-10-17T12:00:00Z");
    await world.service.applyBillingEvent({
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: "pay-ciclo-2",
        subscriptionId: world.account!.gateway_subscription_id,
        amountCents: 7480,
        dueDate: "2026-10-17",
        status: "pending",
        paidAt: null,
        invoiceUrl: "https://pagar.exemplo/2",
      },
    });

    expect(spA.status).toBe("canceled");
    const cycle2 = world.charges.find((c) => c.gateway_payment_id === "pay-ciclo-2")!;
    expect(cycle2.active_count).toBe(2);
    const cycleItems = world.items.filter((i) => i.chargeId === cycle2.id);
    expect(cycleItems.map((i) => [i.position, i.amountCents])).toEqual([
      [1, 3990],
      [2, 3490],
    ]);
  });

  it("cancelar tudo encerra a assinatura", async () => {
    const world = await threeChurches();
    for (const s of [...world.sponsorships]) {
      await world.service.cancelSponsorship(s.id, USER);
    }
    expect(world.providerCalls.some((c) => c.op === "cancel")).toBe(true);
    expect(world.account).toMatchObject({
      gateway_subscription_id: null,
      billing_status: "canceled",
      billed_amount_cents: 0,
    });
  });
});

describe("falhas do provedor e sincronização", () => {
  it("falha ao atualizar valor não desfaz o pedido; fica pendente para o job", async () => {
    const failing = makeWorld({ providerFails: { updateSubscriptionAmount: true } });
    await signUp(failing);
    await failing.service.startSponsorship(A, USER);
    const second = await failing.service.startSponsorship(B, USER);

    expect(second.billingSyncPending).toBe(true);
    expect(failing.account?.billing_sync_status).toBe("pending");
    expect(failing.sponsorships.map((s) => s.status)).toEqual(["active", "active"]);
    expect(failing.log.error).toHaveBeenCalled();
    // O valor gravado continua o antigo até o provedor confirmar.
    expect(failing.account?.billed_amount_cents).toBe(3990);
  });

  it("job sincroniza contas pendentes", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    await world.service.startSponsorship(B, USER);
    // Simula uma divergência (ex.: falha anterior).
    await world.service.applyBillingEvent({
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: "pay-divergente",
        subscriptionId: world.account!.gateway_subscription_id,
        amountCents: 3990,
        dueDate: "2026-10-17",
        status: "pending",
        paidAt: null,
        invoiceUrl: null,
      },
    });
    expect(world.account?.billing_sync_status).toBe("pending");
    // Valor divergente: nada de snapshot enganoso.
    const divergent = world.charges.find((c) => c.gateway_payment_id === "pay-divergente")!;
    expect(world.items.some((i) => i.chargeId === divergent.id)).toBe(false);

    const result = await world.service.runSyncSweep();
    expect(result).toMatchObject({ synced: 1, failed: 0 });
    expect(world.account?.billing_sync_status).toBe("synced");
    expect(lastUpdateAmount(world)).toBe(7480);
  });

  it("não aceita novo patrocínio com pagamento atrasado", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    await world.service.applyBillingEvent({
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: "pay-atrasado",
        subscriptionId: world.account!.gateway_subscription_id,
        amountCents: 3990,
        dueDate: "2026-10-17",
        status: "overdue",
        paidAt: null,
        invoiceUrl: "https://pagar.exemplo/atrasado",
      },
    });
    expect(world.account?.billing_status).toBe("overdue");
    await expect(world.service.startSponsorship(B, USER)).rejects.toThrow(/pagamento pendente/);
    expect((await world.service.getOverview()).paymentState).toBe("pendente");
  });
});

describe("webhook", () => {
  it("é idempotente: o mesmo evento duas vezes não duplica cobrança nem itens", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    const event: BillingWebhookEvent = {
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: "pay-repetido",
        subscriptionId: world.account!.gateway_subscription_id,
        amountCents: 3990,
        dueDate: "2026-10-17",
        status: "paid",
        paidAt: "2026-10-17T12:00:00.000Z",
        invoiceUrl: null,
      },
    };
    await world.service.applyBillingEvent(event);
    await world.service.applyBillingEvent(event);
    expect(world.charges.filter((c) => c.gateway_payment_id === "pay-repetido")).toHaveLength(1);
    const charge = world.charges.find((c) => c.gateway_payment_id === "pay-repetido")!;
    expect(world.items.filter((i) => i.chargeId === charge.id)).toHaveLength(1);
  });

  it("ignora assinatura desconhecida sem quebrar", async () => {
    const world = makeWorld();
    await signUp(world);
    const outcome = await world.service.applyBillingEvent({
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: "x",
        subscriptionId: "sub-de-outro-sistema",
        amountCents: 100,
        dueDate: "2026-10-17",
        status: "paid",
        paidAt: null,
        invoiceUrl: null,
      },
    });
    expect(outcome).toBe("unknown_subscription");
    expect(world.charges).toHaveLength(0);
  });
});

describe("troca de provedor", () => {
  it("conta sem assinatura viva migra para o provedor padrão atual", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    await world.service.cancelSponsorship(world.sponsorships[0].id, USER);
    expect(world.account?.gateway).toBe("fake");

    world.setDefaultProvider("manual");
    await world.service.startSponsorship(B, USER);
    expect(world.account?.gateway).toBe("manual");
    expect(world.account?.gateway_customer_id).toBe("manual-cus");
  });

  it("conta com assinatura viva continua no provedor em que assinou", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    world.setDefaultProvider("manual");
    await world.service.startSponsorship(B, USER);
    expect(world.account?.gateway).toBe("fake");
    expect(world.providerCalls.filter((c) => c.op === "createSubscription")).toHaveLength(1);
  });
});

describe("prévia", () => {
  it("mostra quanto a próxima igreja acrescenta", async () => {
    const world = makeWorld();
    await signUp(world);
    await world.service.startSponsorship(A, USER);
    const preview = await world.service.previewSponsorship("b");
    expect(preview).toMatchObject({
      currentCount: 1,
      currentTotalCents: 3990,
      addedCents: 3490,
      newTotalCents: 7480,
      chargesNow: false,
      alreadySponsoring: false,
    });
    expect((await world.service.previewSponsorship("a")).alreadySponsoring).toBe(true);
  });
});

describe("assinatura pública (sem login)", () => {
  const publicInput = {
    churchPublicCode: "a",
    kind: "person" as const,
    displayName: "Maria Souza",
    document: "529.982.247-25",
    phone: "(14) 99999-8888",
    email: "maria@exemplo.com",
    acceptTerms: true as const,
    emailConsent: true,
  };
  const evidence = { ipAddress: "203.0.113.7", userAgent: "teste" };

  it("email novo: cria conta, patrocínio e assinatura, e manda o link de acesso", async () => {
    const world = makeWorld();
    const result = await world.service.startPublicSponsorship(publicInput, evidence);

    expect(result).toEqual({ kind: "done" }); // provedor fake confirma na hora
    expect(world.account).toMatchObject({
      email: "maria@exemplo.com",
      document: "52998224725",
      billing_status: "active",
      billed_amount_cents: 3990,
    });
    expect(world.sponsorships).toHaveLength(1);
    expect(world.termsAccepted).toEqual([
      { userId: "user-maria@exemplo.com", emailConsent: true, ip: "203.0.113.7" },
    ]);
    expect(world.emailsSent).toHaveLength(1);
    expect(world.emailsSent[0]).toMatchObject({ to: "maria@exemplo.com", isNewSponsor: true });
    expect(world.audits[0]).toMatchObject({ action: "sponsorship.started" });
  });

  it("provedor que exige pagamento devolve o link da fatura", async () => {
    const world = makeWorld();
    world.setDefaultProvider("manual");
    const result = await world.service.startPublicSponsorship(publicInput, evidence);
    expect(result).toEqual({ kind: "checkout", invoiceUrl: "https://pagar.exemplo/1" });
    expect(world.sponsorships[0].status).toBe("pending_payment");
  });

  it("email que já tem conta: não cobra, não vincula, só manda link", async () => {
    const world = makeWorld();
    world.existingEmails.add("maria@exemplo.com");

    const result = await world.service.startPublicSponsorship(publicInput, evidence);

    // O que o atacante veria é isto — nada que confirme a existência da conta.
    expect(result).toEqual({ kind: "check_email" });
    // E, principalmente: ninguém aumentou a fatura de outra pessoa.
    expect(world.sponsorships).toHaveLength(0);
    expect(world.charges).toHaveLength(0);
    expect(world.account).toBeNull();
    expect(world.emailsSent[0]).toMatchObject({ isNewSponsor: false });
    expect(world.emailsSent[0].url).toContain("next=%2Fpatrocinador%2Fpatrocinar%2Fa");
  });

  it("recusa dados inválidos antes de tocar no provedor", async () => {
    const world = makeWorld();
    await expect(
      world.service.startPublicSponsorship({ ...publicInput, document: "111" }, evidence),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "validation_error");
    await expect(
      world.service.startPublicSponsorship({ ...publicInput, acceptTerms: false }, evidence),
    ).rejects.toThrow();
    expect(world.providerCalls).toHaveLength(0);
    expect(world.emailsSent).toHaveLength(0);
  });

  it("igreja inexistente não vira cadastro", async () => {
    const world = makeWorld();
    await expect(
      world.service.startPublicSponsorship({ ...publicInput, churchPublicCode: "zzz" }, evidence),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "not_found");
    expect(world.account).toBeNull();
  });

  it("falha do provedor desfaz o patrocínio pendente", async () => {
    const world = makeWorld({ providerFails: { createSubscription: true } });
    await expect(world.service.startPublicSponsorship(publicInput, evidence)).rejects.toThrow();
    expect(world.sponsorships[0].status).toBe("canceled");
  });

  it("o convite público mostra o preço de entrada e a escada de descontos", async () => {
    const world = makeWorld();
    const invite = await world.service.getInviteData("a");
    expect(invite.church).toMatchObject({ name: "Igreja A", publicCode: "a" });
    expect(invite.entryPriceCents).toBe(3990);
    expect(invite.tiers.map((t) => t.amountCents)).toEqual([3990, 3490, 2990, 2790]);
  });
});

describe("login por link (sem senha)", () => {
  const evidence = { ipAddress: "203.0.113.7", userAgent: "teste" };

  it("envia o link para email com conta", async () => {
    const world = makeWorld();
    await world.service.startPublicSponsorship(
      {
        churchPublicCode: "a",
        kind: "person" as const,
        displayName: "Maria",
        document: "529.982.247-25",
        phone: "",
        email: "maria@exemplo.com",
        acceptTerms: true as const,
        emailConsent: false,
      },
      evidence,
    );
    world.emailsSent.length = 0;

    await world.service.requestAccessLink("  Maria@Exemplo.COM ", evidence);

    expect(world.emailsSent).toHaveLength(1);
    expect(world.emailsSent[0]).toMatchObject({ to: "maria@exemplo.com" });
    expect(world.emailsSent[0].url).toContain("next=%2Fpatrocinador");
  });

  it("email SEM conta: nada é gerado nem enviado, e a tela diz o mesmo", async () => {
    const world = makeWorld();

    await expect(
      world.service.requestAccessLink("desconhecido@exemplo.com", evidence),
    ).resolves.toBeUndefined();

    // Importante: o provedor CRIA usuário ao gerar link, então nem chegamos
    // a pedir um — senão qualquer um criaria contas testando emails.
    expect(world.emailsSent).toHaveLength(0);
    expect(world.existingEmails.has("desconhecido@exemplo.com")).toBe(false);
  });

  it("recusa email inválido antes de qualquer envio", async () => {
    const world = makeWorld();
    await expect(world.service.requestAccessLink("nao-e-email", evidence)).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "validation_error",
    );
    expect(world.emailsSent).toHaveLength(0);
  });

  it("consome rate limit por email e por IP", async () => {
    const consumed: string[] = [];
    const world = makeWorld({ publicLimiter: { consume: async (k: string) => void consumed.push(k) } });
    await world.service.requestAccessLink("maria@exemplo.com", evidence);
    expect(consumed).toEqual([
      "sponsor-access-link:maria@exemplo.com",
      "sponsor-access-link-ip:203.0.113.7",
    ]);
  });
});
