import type { RecurringBillingProvider } from "@/adapters/payment/RecurringBillingProvider";
import {
  accessLinkSchema,
  churchIdSchema,
  publicSponsorshipSchema,
  sponsorProfileUpdateSchema,
  sponsorshipIdSchema,
  sponsorSignupSchema,
} from "@/features/sponsor/schemas";
import { brand } from "@/config/brand";
import { addMonths, todayInBillingZone } from "@/lib/billingDates";
import { AppError, toValidationError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type {
  BillingWebhookEvent,
  PublicSponsorshipResult,
  SponsorAccount,
  SponsorCharge,
  SponsorChargeStatus,
  SponsorOverview,
  Sponsorship,
  SponsorshipStatus,
  SponsorshipInviteChurch,
  SponsorshipView,
  SponsorshipWithChurch,
} from "@/types/sponsorship";
import { allocatePositions, marginalPriceForNext, totalForCount, type PriceTier } from "./sponsorPricing";

/**
 * Regra de negócio do patrocínio.
 *
 * Invariante que tudo aqui protege: o valor configurado no provedor é sempre
 * `totalForCount(patrocínios cobráveis)`. O banco é a fonte da verdade; o
 * provedor é informado. Se a chamada ao provedor falhar, a mudança do
 * patrocinador NÃO é desfeita — a conta fica com sync pendente e o job
 * reenvia o valor antes do próximo vencimento.
 *
 * Cobráveis = `active` + `pending_payment`. `cancel_scheduled` continua
 * aparecendo na igreja até o fim do ciclo pago, mas já não entra no próximo.
 */

const BILLABLE_STATUSES: SponsorshipStatus[] = ["active", "pending_payment"];

export function isBillable(status: SponsorshipStatus): boolean {
  return BILLABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Contratos de persistência
// ---------------------------------------------------------------------------

/** Operações do próprio patrocinador (client do usuário, RLS valendo). */
export interface SponsorRepository {
  getMyAccount(): Promise<SponsorAccount | null>;
  createMyAccount(input: {
    userId: string;
    kind: SponsorAccount["kind"];
    displayName: string;
    email: string;
    phone: string | null;
    document: string;
    visibleOnPage: boolean;
  }): Promise<SponsorAccount>;
  updateMyAccount(input: { displayName: string; phone: string | null }): Promise<void>;
  listMySponsorships(): Promise<SponsorshipWithChurch[]>;
  listMyCharges(): Promise<SponsorCharge[]>;
  /** RPC request_sponsorship: o banco decide o status inicial. */
  requestSponsorship(churchId: string): Promise<Sponsorship>;
  /** RPC cancel_sponsorship: checa dono, agenda ou cancela. */
  cancelSponsorship(sponsorshipId: string): Promise<Sponsorship>;
  listPriceTiers(): Promise<PriceTier[]>;
  findPublicChurch(
    publicCode: string,
  ): Promise<{ id: string; name: string; publicCode: string; hasOwner: boolean } | null>;
}

export interface BillableSponsorshipRow {
  id: string;
  church_id: string;
  company_id: string;
  status: SponsorshipStatus;
  created_at: string;
}

/** O que a sincronização da cobrança devolve a quem a pediu. */
export interface SyncBillingResult {
  /** Página do provedor onde o cartão é informado, quando é o caso. */
  invoiceUrl: string | null;
  /** O provedor não recebeu a mudança; o job de sincronização tenta de novo. */
  syncPending: boolean;
  /** Pix Automático: o QR Code que o pagador lê para pagar e autorizar. */
  pix?: { payload: string; expiresAt: string | null } | null;
  /** Pix Automático com valor alterado: a autorização foi cancelada e precisa ser refeita. */
  reauthorizationNeeded?: boolean;
}

export interface AccountBillingPatch {
  gateway?: string | null;
  gateway_customer_id?: string | null;
  gateway_subscription_id?: string | null;
  gateway_authorization_id?: string | null;
  billing_status?: SponsorAccount["billing_status"];
  billed_amount_cents?: number | null;
  billing_sync_status?: SponsorAccount["billing_sync_status"];
  billing_synced_at?: string | null;
  next_due_date?: string | null;
}

export interface ChargeUpsert {
  sponsorId: string;
  gateway: string;
  gatewayPaymentId: string;
  amountCents: number;
  activeCount: number;
  dueDate: string;
  status: SponsorChargeStatus;
  paidAt: string | null;
  invoiceUrl: string | null;
}

/**
 * Escritas privilegiadas (service_role): estado de cobrança, cobranças e
 * transições disparadas pelo provedor. Só compostas em src/server.
 */
export interface SponsorBillingStore {
  getAccount(accountId: string): Promise<SponsorAccount | null>;
  findAccountBySubscription(gateway: string, subscriptionId: string): Promise<SponsorAccount | null>;
  updateAccountBilling(accountId: string, patch: AccountBillingPatch): Promise<void>;
  listBillableSponsorships(accountId: string): Promise<BillableSponsorshipRow[]>;
  /** pending_payment -> active. */
  activatePendingSponsorships(accountId: string, at: string): Promise<number>;
  /** cancel_scheduled com ends_at vencido -> canceled. Sem conta = todas. */
  finalizeEndedCancellations(now: string, accountId?: string): Promise<number>;
  /** Cancela na hora um pedido que não chegou a virar cobrança. */
  discardPendingSponsorship(sponsorshipId: string, at: string): Promise<void>;
  /** Cobrança já gravada deste pagamento, se existir. */
  findCharge(gateway: string, gatewayPaymentId: string): Promise<SponsorCharge | null>;
  /** Existe cobrança PAGA com vencimento igual ou posterior a esta data? */
  hasPaidChargeOnOrAfter(sponsorId: string, dueDate: string): Promise<boolean>;
  /** Devolve a cobrança e se ela acabou de ser criada. */
  upsertCharge(input: ChargeUpsert): Promise<{ charge: SponsorCharge; created: boolean }>;
  countChargeItems(chargeId: string): Promise<number>;
  insertChargeItems(
    items: Array<{
      chargeId: string;
      sponsorshipId: string;
      churchId: string;
      companyId: string;
      position: number;
      amountCents: number;
    }>,
  ): Promise<void>;
  listAccountsNeedingSync(limit: number): Promise<string[]>;
  listPriceTiers(): Promise<PriceTier[]>;

  // --- usados só pelo fluxo público (sem sessão) ---
  findAccountByEmail(email: string): Promise<SponsorAccount | null>;
  findChurchByPublicCode(publicCode: string): Promise<(SponsorshipInviteChurch & { companyId: string | null }) | null>;
  createAccountForUser(input: {
    userId: string;
    kind: SponsorAccount["kind"];
    displayName: string;
    email: string;
    phone: string | null;
    document: string;
    visibleOnPage: boolean;
  }): Promise<SponsorAccount>;
  /** Limite de vagas de primeiro patrocínio da igreja e quantas já foram ocupadas. */
  getChurchPrimeiroSlots(churchId: string): Promise<{ limite: number | null; ocupadas: number }>;
  /** Mesma decisão de status da RPC: sem cobrança ativa nasce pendente. */
  createSponsorshipForAccount(
    accountId: string,
    churchId: string,
    companyId: string,
    primeiro: boolean,
  ): Promise<Sponsorship>;
  recordTermsAcceptance(userId: string, evidence: RequestEvidence, emailConsent: boolean): Promise<void>;
}

/**
 * Provisão de acesso para quem assina SEM login. Implementado em src/server
 * sobre a API admin do Supabase Auth.
 */
export interface SponsorIdentityProvider {
  /**
   * Cria o usuário sem senha. Email já cadastrado devolve
   * `{ alreadyExists: true }` — NUNCA lança, porque essa informação decide o
   * caminho e não pode virar erro visível na tela.
   */
  createPasswordlessUser(input: {
    email: string;
    fullName: string;
  }): Promise<{ userId: string | null; alreadyExists: boolean }>;
  /** Link de acesso de uso único (magic link) já apontando para `nextPath`. */
  createAccessLink(email: string, nextPath: string): Promise<string>;
}

export interface SponsorMailer {
  sendAccessLink(input: {
    to: string;
    url: string;
    churchName: string;
    /** false = a conta já existia; o texto do email muda. */
    isNewSponsor: boolean;
  }): Promise<void>;
}

export interface RequestEvidence {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SponsorAuditEntry {
  companyId: string;
  userId: string | null;
  action: string;
  sponsorshipId: string;
  metadata?: Record<string, unknown>;
}

export interface SponsorServiceDeps {
  repo: SponsorRepository;
  store: SponsorBillingStore;
  /** Resolve pelo nome gravado na conta; sem nome, o provedor padrão. */
  resolveProvider: (name?: string | null) => RecurringBillingProvider;
  defaultProviderName: () => string;
  /** URL pública da app, usada nos retornos do provedor de pagamento. */
  appUrl: string;
  /** Só necessária se alguma conta puder ser de autopatrocínio (ver resolveTiersFor). */
  /** Mensalidade da igreja da conta: o valor combinado com ela, ou o padrão. */
  getAutopatrocinioAmountCents?: (churchId: string | null) => Promise<number>;
  audit?: (entry: SponsorAuditEntry) => Promise<void>;
  /** Só o fluxo público precisa; ausente = página pública desabilitada. */
  identity?: SponsorIdentityProvider;
  mailer?: SponsorMailer;
  /** Limite do endereço PÚBLICO: ele cria cliente no gateway e envia email. */
  publicRateLimiter?: RateLimiter;
  now?: () => Date;
  log?: Pick<Console, "warn" | "error">;
}

export interface Actor {
  userId: string;
  email: string;
}

export interface StartSponsorshipResult {
  sponsorship: Sponsorship;
  /** Link da 1ª fatura, quando o patrocinador precisa pagar agora. */
  invoiceUrl: string | null;
  /** O valor novo ainda não chegou ao provedor (o job reenvia). */
  billingSyncPending: boolean;
}

export function createSponsorService(deps: SponsorServiceDeps) {
  const { repo, store, resolveProvider, defaultProviderName, identity, mailer } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? console;

  async function requireAccount(): Promise<SponsorAccount> {
    const account = await repo.getMyAccount();
    if (!account) {
      throw new AppError("validation_error", "Complete seu cadastro de patrocinador para continuar.");
    }
    return account;
  }

  /**
   * Preço de uma conta de autopatrocínio: sempre um "tier" único de posição
   * 1, com o valor fixo configurado — não a tabela por posição de verdade.
   * A conta tem sempre exatamente UM patrocínio (ela mesma), então isto
   * basta para `totalForCount`/`allocatePositions` calcularem certo sem
   * precisar saber que é autopatrocínio.
   */
  async function resolveTiersFor(account: SponsorAccount): Promise<PriceTier[]> {
    if (!account.is_self_payment) return store.listPriceTiers();
    if (!deps.getAutopatrocinioAmountCents) {
      throw new AppError("internal_error", "Valor do autopatrocínio não configurado.");
    }
    return [{ position: 1, amountCents: await deps.getAutopatrocinioAmountCents(account.church_id) }];
  }

  async function recordAudit(entry: SponsorAuditEntry): Promise<void> {
    if (!deps.audit) return;
    try {
      await deps.audit(entry);
    } catch (err) {
      // Auditoria da igreja não pode desfazer a ação do patrocinador, que já
      // passou pelo banco e pelo provedor. Fica registrado no log.
      log.error("[sponsor] falha ao registrar auditoria", { action: entry.action, err });
    }
  }

  /**
   * Garante que o provedor cobra `totalForCount(cobráveis)`.
   *
   * - 0 cobráveis: encerra a assinatura (quem tem cancelamento agendado já
   *   pagou o ciclo corrente).
   * - Sem assinatura e `createIfMissing`: cria cliente (se preciso) e
   *   assinatura. Sem assinatura ativa é também o momento natural de migrar a
   *   conta para o provedor padrão atual.
   * - Com assinatura e valor diferente: atualiza. Falha vira sync pendente.
   */
  /**
   * Encerra a recorrência da conta no provedor: a autorização do Pix
   * Automático (que leva a assinatura junto), ou a assinatura do cartão.
   */
  async function encerrarRecorrencia(account: SponsorAccount): Promise<void> {
    if (!account.gateway) return;
    const provider = resolveProvider(account.gateway);
    if (account.gateway_authorization_id && provider.cancelPixAutomatic) {
      await provider.cancelPixAutomatic(account.gateway_authorization_id);
      return;
    }
    if (account.gateway_subscription_id) await provider.cancelSubscription(account.gateway_subscription_id);
  }

  async function syncBilling(
    accountId: string,
    options: { createIfMissing: boolean; successUrl?: string },
  ): Promise<SyncBillingResult> {
    const account = await store.getAccount(accountId);
    if (!account) {
      throw new AppError("not_found", "Conta de patrocinador não encontrada.");
    }

    const [billable, tiers] = await Promise.all([store.listBillableSponsorships(accountId), resolveTiersFor(account)]);
    const total = totalForCount(billable.length, tiers);
    const syncedAt = now().toISOString();

    if (billable.length === 0) {
      if (account.gateway_subscription_id && account.gateway) {
        try {
          await encerrarRecorrencia(account);
        } catch (err) {
          log.error("[sponsor] falha ao encerrar assinatura", { accountId, err });
          await store.updateAccountBilling(accountId, { billing_sync_status: "pending" });
          return { invoiceUrl: null, syncPending: true };
        }
        await store.updateAccountBilling(accountId, {
          gateway_subscription_id: null,
          gateway_authorization_id: null,
          billing_status: account.billing_status === "none" ? "none" : "canceled",
          billed_amount_cents: 0,
          billing_sync_status: "synced",
          billing_synced_at: syncedAt,
        });
      }
      return { invoiceUrl: null, syncPending: false };
    }

    if (!account.gateway_subscription_id) {
      if (!options.createIfMissing) {
        return { invoiceUrl: null, syncPending: false };
      }

      // Sem assinatura viva, a conta vai para o provedor padrão ATUAL — se ele
      // mudou, o cliente antigo fica para trás e um novo é criado.
      const providerName = defaultProviderName();
      const provider = resolveProvider(providerName);
      let customerId = account.gateway === providerName ? account.gateway_customer_id : null;

      if (!customerId) {
        ({ customerId } = await provider.createCustomer({
          name: account.display_name,
          email: account.email,
          document: account.document,
          phone: account.phone,
          externalReference: account.id,
        }));
        // Grava já: se a assinatura falhar, a próxima tentativa reaproveita.
        await store.updateAccountBilling(accountId, {
          gateway: providerName,
          gateway_customer_id: customerId,
        });
      }

      const dueDate = todayInBillingZone(now());

      // Mensalidade da igreja por Pix Automático: em vez da assinatura no
      // cartão, uma autorização. O que volta é o QR Code que a igreja lê no
      // aplicativo do banco (paga o primeiro mês e autoriza os seguintes).
      if (account.is_self_payment && account.payment_method === "pix_automatico") {
        if (!provider.createPixAutomatic) {
          throw new AppError(
            "validation_error",
            "O Pix Automático ainda não está disponível. Use o cartão de crédito.",
          );
        }
        const pix = await provider.createPixAutomatic({
          customerId,
          amountCents: total,
          startDate: dueDate,
          description: `Mensalidade ${brand.name}`,
          externalReference: account.id,
        });
        await store.updateAccountBilling(accountId, {
          gateway: providerName,
          gateway_subscription_id: pix.subscriptionId,
          gateway_authorization_id: pix.authorizationId,
          billed_amount_cents: total,
          billing_sync_status: "synced",
          billing_synced_at: syncedAt,
          next_due_date: dueDate,
        });
        for (const event of pix.immediateEvents ?? []) {
          await applyBillingEvent(event);
        }
        return { invoiceUrl: null, syncPending: false, pix: { payload: pix.qrPayload, expiresAt: pix.expiresAt } };
      }

      const created = await provider.createSubscription({
        customerId,
        amountCents: total,
        nextDueDate: dueDate,
        // Nome da marca configurado: é o que aparece na fatura do cartão, e
        // precisa ser reconhecível.
        description: account.is_self_payment
          ? `Mensalidade ${brand.name}`
          : `Patrocínio ${brand.name} — ${billable.length} igreja(s)`,
        externalReference: account.id,
        successUrl: options.successUrl,
      });

      await store.updateAccountBilling(accountId, {
        gateway: providerName,
        gateway_subscription_id: created.subscriptionId,
        billed_amount_cents: total,
        billing_sync_status: "synced",
        billing_synced_at: syncedAt,
        next_due_date: dueDate,
      });

      for (const event of created.immediateEvents ?? []) {
        await applyBillingEvent(event);
      }

      return { invoiceUrl: created.firstInvoiceUrl, syncPending: false };
    }

    if (account.billed_amount_cents === total && account.billing_sync_status === "synced") {
      return { invoiceUrl: null, syncPending: false };
    }

    // Pix Automático: o pagador autorizou um valor FIXO, então não dá para só
    // trocar o valor. A autorização antiga é cancelada e a igreja autoriza de
    // novo, já no valor novo (a tela dela passa a pedir isso).
    if (account.payment_method === "pix_automatico") {
      try {
        await encerrarRecorrencia(account);
      } catch (err) {
        log.error("[sponsor] falha ao cancelar a autorização de Pix para trocar o valor", { accountId, total, err });
        await store.updateAccountBilling(accountId, { billing_sync_status: "pending" });
        return { invoiceUrl: null, syncPending: true };
      }
      await store.updateAccountBilling(accountId, {
        gateway_subscription_id: null,
        gateway_authorization_id: null,
        billed_amount_cents: 0,
        billing_sync_status: "synced",
        billing_synced_at: syncedAt,
      });
      return { invoiceUrl: null, syncPending: false, reauthorizationNeeded: true };
    }

    try {
      await resolveProvider(account.gateway).updateSubscriptionAmount(account.gateway_subscription_id, total);
    } catch (err) {
      log.error("[sponsor] falha ao atualizar valor da assinatura", { accountId, total, err });
      await store.updateAccountBilling(accountId, { billing_sync_status: "pending" });
      return { invoiceUrl: null, syncPending: true };
    }

    await store.updateAccountBilling(accountId, {
      billed_amount_cents: total,
      billing_sync_status: "synced",
      billing_synced_at: syncedAt,
    });
    return { invoiceUrl: null, syncPending: false };
  }

  /**
   * Recomeça o pagamento da mensalidade de uma igreja: para quando a pessoa
   * fechou a tela do QR Code (ele vence), ou quando a autorização foi
   * cancelada por mudança de valor. O que estiver pendente no provedor é
   * encerrado antes, para não sobrarem duas cobranças.
   *
   * Quem já está pagando não recomeça: a recorrência em vigor não é derrubada.
   */
  async function restartSelfPayment(
    accountId: string,
    options: { successUrl?: string } = {},
  ): Promise<SyncBillingResult> {
    const account = await store.getAccount(accountId);
    if (!account || !account.is_self_payment) {
      throw new AppError("not_found", "Mensalidade não encontrada.");
    }
    if (account.gateway_subscription_id) {
      const billable = await store.listBillableSponsorships(accountId);
      if (billable.some((row) => row.status === "active")) {
        throw new AppError("validation_error", "A mensalidade já está sendo paga.");
      }
      try {
        await encerrarRecorrencia(account);
      } catch (err) {
        log.error("[sponsor] falha ao encerrar a cobrança pendente da mensalidade", { accountId, err });
        throw new AppError(
          "payment_error",
          "Não foi possível recomeçar o pagamento agora. Tente de novo em instantes.",
          err,
        );
      }
      await store.updateAccountBilling(accountId, {
        gateway_subscription_id: null,
        gateway_authorization_id: null,
        billed_amount_cents: 0,
      });
    }
    return syncBilling(accountId, { createIfMissing: true, ...options });
  }

  /**
   * Aplica um evento do provedor. Idempotente: o mesmo evento entregue duas
   * vezes não duplica cobrança nem itens.
   */
  async function applyBillingEvent(
    event: BillingWebhookEvent,
  ): Promise<"applied" | "ignored" | "unknown_subscription" | "stale"> {
    if (event.kind !== "charge") return "ignored";
    const { charge, provider } = event;
    if (!charge.subscriptionId) return "ignored";

    const account = await store.findAccountBySubscription(provider, charge.subscriptionId);
    if (!account) {
      log.warn("[sponsor] cobrança de assinatura desconhecida", {
        provider,
        subscriptionId: charge.subscriptionId,
      });
      return "unknown_subscription";
    }

    // Webhook não chega em ordem: uma reentrega de "vencido" pode aparecer
    // depois do "pago" do MESMO pagamento. Aplicar na ordem de chegada faria
    // a marca do patrocinador sumir da vitrine por uma cobrança que já foi
    // quitada. Pagamento só sai de `paid` por estorno ou cancelamento.
    const existente = await store.findCharge(provider, charge.paymentId);
    if (existente?.status === "paid" && (charge.status === "pending" || charge.status === "overdue")) {
      log.warn("[sponsor] evento atrasado ignorado: cobrança já paga", {
        provider,
        paymentId: charge.paymentId,
        recebido: charge.status,
      });
      return "stale";
    }

    const nowIso = now().toISOString();
    // Virada de ciclo: quem pediu cancelamento e já passou do período pago sai.
    await store.finalizeEndedCancellations(nowIso, account.id);

    if (charge.status === "paid") {
      await store.activatePendingSponsorships(account.id, charge.paidAt ?? nowIso);
    }

    const [billable, tiers] = await Promise.all([store.listBillableSponsorships(account.id), resolveTiersFor(account)]);

    const { charge: saved } = await store.upsertCharge({
      sponsorId: account.id,
      gateway: provider,
      gatewayPaymentId: charge.paymentId,
      amountCents: charge.amountCents,
      activeCount: billable.length,
      dueDate: charge.dueDate,
      status: charge.status,
      paidAt: charge.paidAt,
      invoiceUrl: charge.invoiceUrl,
    });

    // Snapshot da divisão por igreja: só quando bate com o valor cobrado. Se
    // não bate, o provedor está com valor velho — marca sync e o próximo
    // evento (depois da correção) grava os itens.
    const allocation = allocatePositions(
      billable.map((row) => ({ ...row, rankedAt: row.created_at })),
      tiers,
    );
    const expected = allocation.reduce((sum, item) => sum + item.amountCents, 0);

    if (expected !== charge.amountCents) {
      if (charge.status === "pending" || charge.status === "overdue") {
        log.warn("[sponsor] cobrança com valor diferente do calculado", {
          accountId: account.id,
          charged: charge.amountCents,
          expected,
        });
        await store.updateAccountBilling(account.id, { billing_sync_status: "pending" });
      }
    } else if (allocation.length > 0 && (await store.countChargeItems(saved.id)) === 0) {
      await store.insertChargeItems(
        allocation.map((item) => ({
          chargeId: saved.id,
          sponsorshipId: item.sponsorship.id,
          churchId: item.sponsorship.church_id,
          companyId: item.sponsorship.company_id,
          position: item.position,
          amountCents: item.amountCents,
        })),
      );
    }

    const patch: AccountBillingPatch = {};
    switch (charge.status) {
      case "paid":
        patch.billing_status = "active";
        patch.next_due_date = addMonths(charge.dueDate, 1);
        break;
      case "overdue": {
        // "Vencido" de um ciclo ANTIGO, chegando depois de um ciclo novo já
        // pago, não pode marcar a conta como inadimplente.
        const cicloMaisNovoPago = await store.hasPaidChargeOnOrAfter(account.id, charge.dueDate);
        if (!cicloMaisNovoPago) patch.billing_status = "overdue";
        break;
      }
      case "pending":
        if (account.billing_status !== "overdue") {
          patch.next_due_date = charge.dueDate;
        }
        break;
      default:
        break;
    }
    if (Object.keys(patch).length > 0) {
      await store.updateAccountBilling(account.id, patch);
    }

    return "applied";
  }

  return {
    applyBillingEvent,
    syncBilling,
    restartSelfPayment,

    async getMyAccount(): Promise<SponsorAccount | null> {
      return repo.getMyAccount();
    },

    /** Cria a conta do patrocinador (uma por usuário). */
    async createAccount(input: unknown, actor: Actor): Promise<SponsorAccount> {
      const parsed = sponsorSignupSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);

      const existing = await repo.getMyAccount();
      if (existing) {
        throw new AppError("conflict", "Você já tem um cadastro de patrocinador.");
      }

      return repo.createMyAccount({
        userId: actor.userId,
        kind: parsed.data.kind,
        displayName: parsed.data.displayName,
        // E-mail da conta de login, não do formulário: é para ele que o
        // provedor manda a fatura.
        email: actor.email,
        phone: parsed.data.phone,
        document: parsed.data.document,
        visibleOnPage: parsed.data.visibleOnPage,
      });
    },

    async updateProfile(input: unknown): Promise<void> {
      const parsed = sponsorProfileUpdateSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await requireAccount();
      await repo.updateMyAccount(parsed.data);
    },

    async getOverview(): Promise<SponsorOverview> {
      const account = await requireAccount();
      const [sponsorships, charges, tiers] = await Promise.all([
        repo.listMySponsorships(),
        repo.listMyCharges(),
        repo.listPriceTiers(),
      ]);

      const billableCount = sponsorships.filter((s) => isBillable(s.status)).length;
      const visibleCount = sponsorships.filter((s) => s.status === "active" || s.status === "cancel_scheduled").length;
      const openCharge = charges.find((c) => c.status === "pending" || c.status === "overdue");

      let paymentState: SponsorOverview["paymentState"];
      if (account.billing_status === "overdue") {
        paymentState = "pendente";
      } else if (sponsorships.some((s) => s.status === "pending_payment")) {
        paymentState = "pendente";
      } else if (account.billing_status === "active") {
        paymentState = "em_dia";
      } else {
        paymentState = "sem_cobranca";
      }

      return {
        account,
        billableCount,
        visibleCount,
        monthlyTotalCents: totalForCount(billableCount, tiers),
        paymentState,
        openInvoiceUrl: openCharge?.invoice_url ?? null,
        billingSyncPending: account.billing_sync_status !== "synced",
      };
    },

    /** Patrocínios com o valor que cada um representa HOJE. */
    async listSponsorships(): Promise<SponsorshipView[]> {
      await requireAccount();
      const [sponsorships, tiers] = await Promise.all([repo.listMySponsorships(), repo.listPriceTiers()]);

      const allocation = allocatePositions(
        sponsorships.filter((s) => isBillable(s.status)).map((s) => ({ ...s, rankedAt: s.created_at })),
        tiers,
      );
      const byId = new Map(allocation.map((item) => [item.sponsorship.id, item]));

      const statusOrder: Record<SponsorshipStatus, number> = {
        active: 0,
        pending_payment: 0,
        cancel_scheduled: 1,
        canceled: 2,
      };

      return sponsorships
        .map((s): SponsorshipView => {
          const allocated = byId.get(s.id);
          return {
            id: s.id,
            churchId: s.church_id,
            churchName: s.church_name,
            churchPublicCode: s.church_public_code,
            status: s.status,
            position: allocated?.position ?? null,
            currentAmountCents: allocated?.amountCents ?? null,
            activatedAt: s.activated_at,
            endsAt: s.ends_at,
          };
        })
        .sort(
          (a, b) =>
            statusOrder[a.status] - statusOrder[b.status] ||
            (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
        );
    },

    /** Tabela de preços por posição, para a tela explicar a conta. */
    async getPriceTable(): Promise<PriceTier[]> {
      return repo.listPriceTiers();
    },

    /**
     * Dados do convite PÚBLICO (sem sessão): a igreja e o preço de entrada.
     * O preço mostrado aqui é o TETO — vale para quem chega novo. Quem já
     * patrocina paga menos, e vê o valor exato depois de entrar. Nunca o
     * contrário: anunciar menos do que se cobra destrói a confiança na
     * primeira tela.
     */
    async getInviteData(publicCode: string): Promise<{
      church: SponsorshipInviteChurch;
      tiers: PriceTier[];
      entryPriceCents: number;
      /** Sem vaga, a página avisa em vez de deixar preencher para falhar depois. */
      vagasEsgotadas: boolean;
    }> {
      const church = await store.findChurchByPublicCode(publicCode);
      if (!church || !church.companyId) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }
      const [tiers, slots] = await Promise.all([store.listPriceTiers(), store.getChurchPrimeiroSlots(church.id)]);
      return {
        church: {
          id: church.id,
          name: church.name,
          publicCode: church.publicCode,
          address: church.address,
          logoUrl: church.logoUrl,
        },
        tiers,
        entryPriceCents: totalForCount(1, tiers),
        vagasEsgotadas: slots.limite !== null && slots.ocupadas >= slots.limite,
      };
    },

    /**
     * "Entrar com link por email". A conta criada pelo fluxo público NÃO tem
     * senha — sem isto, quem perdesse o email do acesso ficaria trancado do
     * lado de fora.
     *
     * A resposta é SEMPRE a mesma, exista a conta ou não: email desconhecido
     * receberia silêncio, e a tela diria o mesmo de qualquer jeito. É o que
     * impede alguém de descobrir quem tem cadastro testando endereços.
     */
    async requestAccessLink(rawEmail: unknown, evidence: RequestEvidence): Promise<void> {
      if (!identity || !mailer) {
        throw new AppError("internal_error", "Acesso por link não configurado");
      }

      const parsed = accessLinkSchema.safeParse({ email: rawEmail });
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const email = parsed.data.email;

      await deps.publicRateLimiter?.consume(`sponsor-access-link:${email}`);
      if (evidence.ipAddress) {
        await deps.publicRateLimiter?.consume(`sponsor-access-link-ip:${evidence.ipAddress}`);
      }

      // Confere a conta ANTES de pedir o link: `generateLink` do provedor CRIA
      // o usuário quando o email não existe. Sem esta guarda, qualquer um
      // criaria contas fantasma testando endereços — e mandaria email de
      // acesso para gente que nunca se cadastrou.
      const account = await store.findAccountByEmail(email);
      if (!account) {
        log.warn("[sponsor] link de acesso pedido para email sem conta");
        return;
      }

      try {
        const url = await identity.createAccessLink(email, "/patrocinador");
        await mailer.sendAccessLink({
          to: email,
          url,
          churchName: "",
          isNewSponsor: false,
        });
      } catch (err) {
        // Falha de provedor não pode virar mensagem diferente na tela.
        log.warn("[sponsor] link de acesso não enviado", {
          reason: err instanceof Error ? err.message : "desconhecido",
        });
      }
    },

    /**
     * Assinatura iniciada na página pública, SEM login.
     *
     * A decisão que move tudo: se o email já tem conta, NADA é cobrado nem
     * vinculado aqui. Vincular sem provar posse do email deixaria qualquer um
     * aumentar a fatura de outra pessoa digitando o email dela. Nesse caso
     * mandamos um link de acesso, e a pessoa confirma autenticada — onde o
     * valor com desconto aparece.
     */
    async startPublicSponsorship(input: unknown, evidence: RequestEvidence): Promise<PublicSponsorshipResult> {
      if (!identity || !mailer) {
        throw new AppError("internal_error", "Assinatura pública não configurada");
      }

      const parsed = publicSponsorshipSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const data = parsed.data;

      const church = await store.findChurchByPublicCode(data.churchPublicCode);
      if (!church || !church.companyId) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      // Quem assina por aqui nunca tem conta ainda, então isto é sempre um
      // PRIMEIRO patrocínio e ocupa vaga. A checagem é feita antes de criar
      // usuário, conta e cliente no gateway — a RPC do fluxo logado barra no
      // banco, e este caminho não passa por ela.
      const slots = await store.getChurchPrimeiroSlots(church.id);
      if (slots.limite !== null && slots.ocupadas >= slots.limite) {
        throw new AppError("conflict", "As vagas de patrocínio desta igreja estão esgotadas.");
      }

      // Endereço público que cria cliente no gateway e dispara email: sem
      // limite, vira máquina de spam.
      await deps.publicRateLimiter?.consume(`public-sponsorship:${data.email}`);
      if (evidence.ipAddress) {
        await deps.publicRateLimiter?.consume(`public-sponsorship-ip:${evidence.ipAddress}`);
      }

      const invitePath = `/patrocinador/patrocinar/${encodeURIComponent(church.publicCode)}`;
      const created = await identity.createPasswordlessUser({
        email: data.email,
        fullName: data.displayName,
      });

      if (created.alreadyExists || !created.userId) {
        // Caminho de quem já tem conta. A tela não diz isso — só que um email
        // foi enviado —, e nenhuma cobrança acontece.
        const url = await identity.createAccessLink(data.email, invitePath);
        await mailer.sendAccessLink({
          to: data.email,
          url,
          churchName: church.name,
          isNewSponsor: false,
        });
        return { kind: "check_email" };
      }

      const account = await store.createAccountForUser({
        userId: created.userId,
        kind: data.kind,
        displayName: data.displayName,
        email: data.email,
        phone: data.phone,
        document: data.document,
        visibleOnPage: data.visibleOnPage,
      });

      // Aceite dos termos: é aqui que a pessoa entra no serviço (LGPD).
      await store.recordTermsAcceptance(created.userId, evidence, data.emailConsent);

      const sponsorship = await store.createSponsorshipForAccount(account.id, church.id, church.companyId, true);

      let billing: { invoiceUrl: string | null; syncPending: boolean };
      try {
        billing = await syncBilling(account.id, {
          createIfMissing: true,
          successUrl: `${deps.appUrl.replace(/\/+$/, "")}${invitePath}/obrigado`,
        });
      } catch (err) {
        await store
          .discardPendingSponsorship(sponsorship.id, now().toISOString())
          .catch((cleanupErr) => log.error("[sponsor] falha ao desfazer pedido", { cleanupErr }));
        throw err;
      }

      await recordAudit({
        companyId: church.companyId,
        userId: created.userId,
        action: "sponsorship.started",
        sponsorshipId: sponsorship.id,
        metadata: { status: sponsorship.status, origin: "public" },
      });

      // O link de acesso vai junto: quem pagou precisa entrar no painel, e
      // não definiu senha nenhuma.
      const url = await identity.createAccessLink(data.email, "/patrocinador");
      await mailer.sendAccessLink({ to: data.email, url, churchName: church.name, isNewSponsor: true }).catch((err) => {
        // Email é recuperável (dá para reenviar); pagamento não pode travar.
        log.error("[sponsor] falha ao enviar link de acesso", { err });
      });

      return billing.invoiceUrl ? { kind: "checkout", invoiceUrl: billing.invoiceUrl } : { kind: "done" };
    },

    async listCharges(): Promise<SponsorCharge[]> {
      await requireAccount();
      return repo.listMyCharges();
    },

    /**
     * Prévia para a tela de confirmação: quanto a mais o patrocinador paga ao
     * incluir esta igreja, e o total que passa a valer.
     */
    async previewSponsorship(publicCode: string) {
      const church = await repo.findPublicChurch(publicCode);
      if (!church || !church.hasOwner) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }
      const [account, sponsorships, tiers] = await Promise.all([
        repo.getMyAccount(),
        repo.listMySponsorships(),
        repo.listPriceTiers(),
      ]);
      const alreadySponsoring = sponsorships.some((s) => s.church_id === church.id && s.status !== "canceled");
      const currentCount = sponsorships.filter((s) => isBillable(s.status)).length;

      return {
        church,
        hasAccount: Boolean(account),
        alreadySponsoring,
        currentCount,
        currentTotalCents: totalForCount(currentCount, tiers),
        addedCents: marginalPriceForNext(currentCount, tiers),
        newTotalCents: totalForCount(currentCount + 1, tiers),
        /** Com cobrança em dia, o novo total vale a partir do próximo ciclo. */
        chargesNow: account?.billing_status !== "active",
        blockedByOverdue: account?.billing_status === "overdue",
      };
    },

    async startSponsorship(churchId: unknown, actor: Actor): Promise<StartSponsorshipResult> {
      const parsedId = churchIdSchema.safeParse(churchId);
      if (!parsedId.success) throw toValidationError(parsedId.error.issues);

      const account = await requireAccount();
      const sponsorship = await repo.requestSponsorship(parsedId.data);

      let result: { invoiceUrl: string | null; syncPending: boolean };
      try {
        result = await syncBilling(account.id, { createIfMissing: true });
      } catch (err) {
        // Sem assinatura criada o pedido não vale: desfaz, para não sobrar um
        // patrocínio "aguardando pagamento" que nunca vai ser cobrado.
        if (sponsorship.status === "pending_payment") {
          await store
            .discardPendingSponsorship(sponsorship.id, now().toISOString())
            .catch((cleanupErr) => log.error("[sponsor] falha ao desfazer pedido", { cleanupErr }));
        }
        throw err;
      }

      await recordAudit({
        companyId: sponsorship.company_id,
        userId: actor.userId,
        action: "sponsorship.started",
        sponsorshipId: sponsorship.id,
        metadata: { status: sponsorship.status },
      });

      return {
        sponsorship,
        invoiceUrl: result.invoiceUrl,
        billingSyncPending: result.syncPending,
      };
    },

    async cancelSponsorship(
      sponsorshipId: unknown,
      actor: Actor,
    ): Promise<{ sponsorship: Sponsorship; billingSyncPending: boolean }> {
      const parsedId = sponsorshipIdSchema.safeParse(sponsorshipId);
      if (!parsedId.success) throw toValidationError(parsedId.error.issues);

      const account = await requireAccount();
      const sponsorship = await repo.cancelSponsorship(parsedId.data);
      if (sponsorship.sponsor_id !== account.id) {
        // A RPC já barra; a checagem aqui é a segunda camada.
        throw new AppError("not_found", "Patrocínio não encontrado.");
      }

      // O total é recalculado do zero pelos cobráveis que sobraram.
      const result = await syncBilling(account.id, { createIfMissing: false });

      await recordAudit({
        companyId: sponsorship.company_id,
        userId: actor.userId,
        action: "sponsorship.canceled",
        sponsorshipId: sponsorship.id,
        metadata: { status: sponsorship.status, endsAt: sponsorship.ends_at },
      });

      return { sponsorship, billingSyncPending: result.syncPending };
    },

    /** Job: reenvia valores pendentes e encerra cancelamentos vencidos. */
    async runSyncSweep(limit = 25): Promise<{ finalized: number; synced: number; failed: number }> {
      const finalized = await store.finalizeEndedCancellations(now().toISOString());
      const accountIds = await store.listAccountsNeedingSync(limit);
      let synced = 0;
      let failed = 0;

      for (const accountId of accountIds) {
        try {
          const result = await syncBilling(accountId, { createIfMissing: false });
          if (result.syncPending) failed += 1;
          else synced += 1;
        } catch (err) {
          failed += 1;
          log.error("[sponsor-sweep] falha ao sincronizar conta", { accountId, err });
        }
      }

      return { finalized, synced, failed };
    },
  };
}

export type SponsorService = ReturnType<typeof createSponsorService>;
