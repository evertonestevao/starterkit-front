import type { SupabaseClient } from "@supabase/supabase-js";
import { formatChurchName } from "@/lib/churchName";
import { AppError } from "@/lib/errors";
import type { PriceTier } from "@/services/sponsorPricing";
import type {
  BillableSponsorshipRow,
  SponsorBillingStore,
  SponsorRepository,
} from "@/services/sponsorService";
import type {
  SponsorAccount,
  SponsorCharge,
  Sponsorship,
  SponsorshipWithChurch,
} from "@/types/sponsorship";

/**
 * Persistência do patrocínio em Supabase.
 *
 * - createSupabaseSponsorRepository: client DO USUÁRIO. RLS garante que só a
 *   própria conta aparece; pedir/cancelar patrocínio passa pelas RPCs.
 * - createSupabaseSponsorBillingStore: client service_role. Só pode ser
 *   composto em src/server (webhook, job, sincronização com o provedor).
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const NO_DATA_FOUND = "P0002";

async function readTiers(client: SupabaseClient): Promise<PriceTier[]> {
  const { data, error } = await client
    .from("sponsor_price_tiers")
    .select("position, amount_cents")
    .order("position", { ascending: true });
  if (error) {
    throw new AppError("internal_error", "Falha ao carregar a tabela de preços", error);
  }
  return (data ?? []).map((row) => ({
    position: row.position as number,
    amountCents: row.amount_cents as number,
  }));
}

function mapRpcError(error: { code?: string; message?: string }, fallback: string): AppError {
  switch (error.code) {
    case UNIQUE_VIOLATION:
      return new AppError("conflict", "Você já patrocina esta igreja.", error);
    case CHECK_VIOLATION:
      // Duas regras da RPC usam check_violation; a mensagem do banco separa.
      if (/vaga/i.test(error.message ?? "")) {
        return new AppError(
          "conflict",
          "As vagas de patrocínio desta igreja estão esgotadas.",
          error,
        );
      }
      return new AppError(
        "validation_error",
        "Há um pagamento pendente. Regularize-o para patrocinar outra igreja.",
        error,
      );
    case NO_DATA_FOUND:
      return new AppError("not_found", "Não encontramos o que você pediu.", error);
    default:
      return new AppError("internal_error", fallback, error);
  }
}

export function createSupabaseSponsorRepository(client: SupabaseClient): SponsorRepository {
  const repo: SponsorRepository = {
    async getMyAccount() {
      const { data, error } = await client
        .from("sponsor_accounts")
        .select("*")
        .is("deleted_at", null)
        .maybeSingle<SponsorAccount>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar o cadastro", error);
      }
      return data;
    },

    async createMyAccount(input) {
      const { data, error } = await client
        .from("sponsor_accounts")
        .insert({
          user_id: input.userId,
          kind: input.kind,
          display_name: input.displayName,
          email: input.email,
          phone: input.phone,
          document: input.document,
          visible_on_page: input.visibleOnPage,
        })
        .select("*")
        .single<SponsorAccount>();
      if (error || !data) {
        if (error?.code === UNIQUE_VIOLATION) {
          throw new AppError("conflict", "Você já tem um cadastro de patrocinador.", error);
        }
        throw new AppError("internal_error", "Falha ao salvar o cadastro", error);
      }
      return data;
    },

    async updateMyAccount(input) {
      const account = await repo.getMyAccount();
      if (!account) {
        throw new AppError("not_found", "Cadastro de patrocinador não encontrado.");
      }
      const { error } = await client
        .from("sponsor_accounts")
        .update({ display_name: input.displayName, phone: input.phone })
        .eq("id", account.id)
        .is("deleted_at", null);
      if (error) {
        throw new AppError("internal_error", "Falha ao salvar o cadastro", error);
      }
    },

    async listMySponsorships() {
      const account = await repo.getMyAccount();
      if (!account) return [];
      const { data, error } = await client
        .from("sponsorships")
        .select("*, church:churches(name, sobrenome, public_code)")
        // Não basta a RLS: a policy de admin de igreja também devolveria
        // patrocínios de OUTROS patrocinadores para quem é pastor e
        // patrocinador ao mesmo tempo.
        .eq("sponsor_id", account.id)
        .order("created_at", { ascending: true });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar patrocínios", error);
      }
      return (data ?? []).map((row) => {
        const church = row.church as { name: string; sobrenome: string | null; public_code: string } | null;
        const sponsorship = { ...row } as Sponsorship & { church?: unknown };
        delete sponsorship.church;
        return {
          ...sponsorship,
          // Nome + sobrenome: várias igrejas do ministério dividem o mesmo nome.
          church_name: church ? formatChurchName(church.name, church.sobrenome) : "Igreja",
          church_public_code: church?.public_code ?? "",
        } satisfies SponsorshipWithChurch;
      });
    },

    async listMyCharges() {
      const account = await repo.getMyAccount();
      if (!account) return [];
      const { data, error } = await client
        .from("sponsor_charges")
        .select("*")
        .eq("sponsor_id", account.id)
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar pagamentos", error);
      }
      return (data ?? []) as SponsorCharge[];
    },

    async requestSponsorship(churchId) {
      const { data, error } = await client
        .rpc("request_sponsorship", { p_church_id: churchId })
        .single<Sponsorship>();
      if (error || !data) {
        throw mapRpcError(error ?? {}, "Falha ao registrar o patrocínio");
      }
      return data;
    },

    async cancelSponsorship(sponsorshipId) {
      const { data, error } = await client
        .rpc("cancel_sponsorship", { p_sponsorship_id: sponsorshipId })
        .single<Sponsorship>();
      if (error || !data) {
        throw mapRpcError(error ?? {}, "Falha ao cancelar o patrocínio");
      }
      return data;
    },

    async listPriceTiers() {
      return readTiers(client);
    },

    async findPublicChurch(publicCode) {
      const { data, error } = await client
        .from("churches")
        .select("id, name, sobrenome, public_code, company_id")
        .eq("public_code", publicCode)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      }
      if (!data) return null;
      return {
        id: data.id as string,
        name: formatChurchName(data.name as string, data.sobrenome as string | null),
        publicCode: data.public_code as string,
        hasOwner: Boolean(data.company_id),
      };
    },
  };
  return repo;
}

export function createSupabaseSponsorBillingStore(adminClient: SupabaseClient): SponsorBillingStore {
  return {
    async getAccount(accountId) {
      const { data, error } = await adminClient
        .from("sponsor_accounts")
        .select("*")
        .eq("id", accountId)
        .is("deleted_at", null)
        .maybeSingle<SponsorAccount>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a conta", error);
      return data;
    },

    async findAccountBySubscription(gateway, subscriptionId) {
      const { data, error } = await adminClient
        .from("sponsor_accounts")
        .select("*")
        .eq("gateway", gateway)
        .eq("gateway_subscription_id", subscriptionId)
        .maybeSingle<SponsorAccount>();
      if (error) throw new AppError("internal_error", "Falha ao localizar a assinatura", error);
      return data;
    },

    async updateAccountBilling(accountId, patch) {
      const { error } = await adminClient.from("sponsor_accounts").update(patch).eq("id", accountId);
      if (error) throw new AppError("internal_error", "Falha ao atualizar a cobrança", error);
    },

    async listBillableSponsorships(accountId) {
      const { data, error } = await adminClient
        .from("sponsorships")
        .select("id, church_id, company_id, status, created_at")
        .eq("sponsor_id", accountId)
        .in("status", ["active", "pending_payment"])
        .order("created_at", { ascending: true });
      if (error) throw new AppError("internal_error", "Falha ao listar patrocínios", error);
      return (data ?? []) as BillableSponsorshipRow[];
    },

    async activatePendingSponsorships(accountId, at) {
      const { data, error } = await adminClient
        .from("sponsorships")
        .update({ status: "active", activated_at: at })
        .eq("sponsor_id", accountId)
        .eq("status", "pending_payment")
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao ativar patrocínios", error);
      return data?.length ?? 0;
    },

    async finalizeEndedCancellations(now, accountId) {
      let query = adminClient
        .from("sponsorships")
        .update({ status: "canceled", canceled_at: now })
        .eq("status", "cancel_scheduled")
        .lte("ends_at", now);
      if (accountId) query = query.eq("sponsor_id", accountId);
      const { data, error } = await query.select("id");
      if (error) throw new AppError("internal_error", "Falha ao encerrar cancelamentos", error);
      return data?.length ?? 0;
    },

    async discardPendingSponsorship(sponsorshipId, at) {
      const { error } = await adminClient
        .from("sponsorships")
        .update({ status: "canceled", canceled_at: at, ends_at: at })
        .eq("id", sponsorshipId)
        .eq("status", "pending_payment");
      if (error) throw new AppError("internal_error", "Falha ao desfazer o pedido", error);
    },

    async findCharge(gateway, gatewayPaymentId) {
      const { data, error } = await adminClient
        .from("sponsor_charges")
        .select("*")
        .eq("gateway", gateway)
        .eq("gateway_payment_id", gatewayPaymentId)
        .maybeSingle<SponsorCharge>();
      if (error) throw new AppError("internal_error", "Falha ao localizar cobrança", error);
      return data;
    },

    async hasPaidChargeOnOrAfter(sponsorId, dueDate) {
      const { count, error } = await adminClient
        .from("sponsor_charges")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", sponsorId)
        .eq("status", "paid")
        .gte("due_date", dueDate);
      if (error) throw new AppError("internal_error", "Falha ao conferir cobranças pagas", error);
      return (count ?? 0) > 0;
    },

    async upsertCharge(input) {
      const lookup = () =>
        adminClient
          .from("sponsor_charges")
          .select("*")
          .eq("gateway", input.gateway)
          .eq("gateway_payment_id", input.gatewayPaymentId)
          .maybeSingle<SponsorCharge>();

      const mutable = {
        amount_cents: input.amountCents,
        due_date: input.dueDate,
        status: input.status,
        paid_at: input.paidAt,
        invoice_url: input.invoiceUrl,
      };

      const update = async (id: string) => {
        const { data, error } = await adminClient
          .from("sponsor_charges")
          .update(mutable)
          .eq("id", id)
          .select("*")
          .single<SponsorCharge>();
        if (error || !data) throw new AppError("internal_error", "Falha ao atualizar cobrança", error);
        return data;
      };

      const existing = await lookup();
      if (existing.error) {
        throw new AppError("internal_error", "Falha ao localizar cobrança", existing.error);
      }
      if (existing.data) {
        return { charge: await update(existing.data.id), created: false };
      }

      const { data, error } = await adminClient
        .from("sponsor_charges")
        .insert({
          sponsor_id: input.sponsorId,
          gateway: input.gateway,
          gateway_payment_id: input.gatewayPaymentId,
          active_count: input.activeCount,
          ...mutable,
        })
        .select("*")
        .single<SponsorCharge>();

      if (error?.code === UNIQUE_VIOLATION) {
        // Dois webhooks do mesmo pagamento ao mesmo tempo: o outro venceu.
        const winner = await lookup();
        if (winner.data) return { charge: await update(winner.data.id), created: false };
      }
      if (error || !data) throw new AppError("internal_error", "Falha ao registrar cobrança", error);
      return { charge: data, created: true };
    },

    async countChargeItems(chargeId) {
      const { count, error } = await adminClient
        .from("sponsor_charge_items")
        .select("id", { count: "exact", head: true })
        .eq("charge_id", chargeId);
      if (error) throw new AppError("internal_error", "Falha ao contar itens", error);
      return count ?? 0;
    },

    async insertChargeItems(items) {
      if (items.length === 0) return;
      const { error } = await adminClient.from("sponsor_charge_items").upsert(
        items.map((item) => ({
          charge_id: item.chargeId,
          sponsorship_id: item.sponsorshipId,
          church_id: item.churchId,
          company_id: item.companyId,
          position: item.position,
          amount_cents: item.amountCents,
        })),
        { onConflict: "charge_id,sponsorship_id", ignoreDuplicates: true },
      );
      if (error) throw new AppError("internal_error", "Falha ao registrar itens da cobrança", error);
    },

    async listAccountsNeedingSync(limit) {
      const { data, error } = await adminClient
        .from("sponsor_accounts")
        .select("id")
        .neq("billing_sync_status", "synced")
        .is("deleted_at", null)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (error) throw new AppError("internal_error", "Falha ao listar contas pendentes", error);
      return (data ?? []).map((row) => row.id as string);
    },

    async listPriceTiers() {
      return readTiers(adminClient);
    },

    // --- fluxo público (sem sessão): tudo com service_role, depois de o
    // service já ter validado entrada, igreja e limite de tentativas ---

    async findAccountByEmail(email) {
      const { data, error } = await adminClient
        .from("sponsor_accounts")
        .select("*")
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle<SponsorAccount>();
      if (error) throw new AppError("internal_error", "Falha ao localizar a conta", error);
      return data;
    },

    async findChurchByPublicCode(publicCode) {
      const { data, error } = await adminClient
        .from("churches")
        .select("id, name, sobrenome, public_code, address, logo_url, company_id")
        .eq("public_code", publicCode)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      if (!data) return null;
      return {
        id: data.id as string,
        name: formatChurchName(data.name as string, data.sobrenome as string | null),
        publicCode: data.public_code as string,
        address: (data.address as string | null) ?? null,
        logoUrl: (data.logo_url as string | null) ?? null,
        companyId: (data.company_id as string | null) ?? null,
      };
    },

    async createAccountForUser(input) {
      const { data, error } = await adminClient
        .from("sponsor_accounts")
        .insert({
          user_id: input.userId,
          kind: input.kind,
          display_name: input.displayName,
          email: input.email,
          phone: input.phone,
          document: input.document,
          visible_on_page: input.visibleOnPage,
        })
        .select("*")
        .single<SponsorAccount>();
      if (error || !data) {
        if (error?.code === UNIQUE_VIOLATION) {
          throw new AppError("conflict", "Este email já tem um cadastro de patrocinador.", error);
        }
        throw new AppError("internal_error", "Falha ao criar o cadastro", error);
      }
      return data;
    },

    async getChurchPrimeiroSlots(churchId) {
      const { data, error } = await adminClient
        .rpc("church_primeiro_slots", { p_church_id: churchId })
        .maybeSingle<{ limite: number | null; ocupadas: number }>();
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao consultar as vagas", error);
      }
      return { limite: data.limite, ocupadas: data.ocupadas };
    },

    async createSponsorshipForAccount(accountId, churchId, companyId, primeiro) {
      // Mesma decisão da RPC request_sponsorship: com cobrança ativa o
      // patrocínio já nasce valendo; senão espera o 1º pagamento.
      const { data: account, error: accountError } = await adminClient
        .from("sponsor_accounts")
        .select("billing_status")
        .eq("id", accountId)
        .single<Pick<SponsorAccount, "billing_status">>();
      if (accountError || !account) {
        throw new AppError("internal_error", "Falha ao carregar a conta", accountError);
      }

      const isActive = account.billing_status === "active";
      const { data, error } = await adminClient
        .from("sponsorships")
        .insert({
          sponsor_id: accountId,
          church_id: churchId,
          company_id: companyId,
          status: isActive ? "active" : "pending_payment",
          activated_at: isActive ? new Date().toISOString() : null,
          // Só a assinatura inicial ocupa vaga na igreja.
          primeiro,
        })
        .select("*")
        .single<Sponsorship>();
      if (error || !data) {
        if (error?.code === UNIQUE_VIOLATION) {
          throw new AppError("conflict", "Você já patrocina esta igreja.", error);
        }
        throw new AppError("internal_error", "Falha ao registrar o patrocínio", error);
      }
      return data;
    },

    async recordTermsAcceptance(userId, evidence, emailConsent) {
      // O patrocinador aceita o contrato DELE. Sem o filtro de público, com
      // um documento vigente para igrejas e outro para patrocinadores, esta
      // consulta devolveria duas linhas — ou, pior, gravaria o aceite do
      // contrato errado.
      const { data: version, error: versionError } = await adminClient
        .from("terms_versions")
        .select("id")
        .eq("is_current", true)
        .eq("audience", "patrocinador")
        .maybeSingle<{ id: string }>();
      if (versionError) {
        throw new AppError("internal_error", "Falha ao carregar os termos vigentes", versionError);
      }
      if (!version) {
        // Sem termos publicados não há o que aceitar; não trava a assinatura.
        return;
      }

      const { error: acceptError } = await adminClient.from("terms_acceptances").upsert(
        {
          user_id: userId,
          terms_version_id: version.id,
          ip_address: evidence.ipAddress,
          user_agent: evidence.userAgent,
        },
        { onConflict: "user_id,terms_version_id", ignoreDuplicates: true },
      );
      if (acceptError) {
        throw new AppError("internal_error", "Falha ao registrar o aceite dos termos", acceptError);
      }

      // Consentimento de email é append-only (revogar = nova linha).
      const { error: consentError } = await adminClient.from("user_consents").insert({
        user_id: userId,
        consent_type: "email_communications",
        granted: emailConsent,
        ip_address: evidence.ipAddress,
        user_agent: evidence.userAgent,
      });
      if (consentError) {
        throw new AppError("internal_error", "Falha ao registrar o consentimento", consentError);
      }
    },
  };
}
