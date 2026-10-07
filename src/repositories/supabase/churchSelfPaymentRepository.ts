import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ChurchSelfPaymentRepository,
  ChurchSelfPaymentStatus,
  SelfPaymentSponsorshipStatus,
} from "@/services/churchSelfPaymentService";
import type { SponsorAccount } from "@/types/sponsorship";

interface SponsorshipRow {
  status: SelfPaymentSponsorshipStatus;
  ends_at: string | null;
}

export function createSupabaseChurchSelfPaymentRepository(client: SupabaseClient): ChurchSelfPaymentRepository {
  async function getAccount(churchId: string): Promise<SponsorAccount | null> {
    const { data, error } = await client
      .from("sponsor_accounts")
      .select("*")
      .eq("church_id", churchId)
      .eq("is_self_payment", true)
      .is("deleted_at", null)
      .maybeSingle<SponsorAccount>();
    if (error) throw new AppError("internal_error", "Falha ao carregar a conta de autopatrocínio", error);
    return data;
  }

  return {
    async getStatus(churchId): Promise<ChurchSelfPaymentStatus> {
      const [countResult, churchResult, account, amountResult, faturaResult] = await Promise.all([
        client.rpc("church_real_billable_sponsorships", { p_church_id: churchId }),
        client.from("churches").select("aceita_patrocinio").eq("id", churchId).single<{ aceita_patrocinio: boolean }>(),
        getAccount(churchId),
        // O valor DESTA igreja: o combinado com a plataforma, ou o padrão.
        client.rpc("mensalidade_da_igreja", { p_church_id: churchId }),
        // Complemento: sem a fatura, a tela só deixa de oferecer o botão de pagar.
        client.rpc("mensalidade_fatura_aberta", { p_church_id: churchId }),
      ]);
      if (countResult.error || churchResult.error || amountResult.error) {
        throw new AppError(
          "internal_error",
          "Falha ao carregar o status de autopatrocínio",
          countResult.error ?? churchResult.error ?? amountResult.error,
        );
      }

      let sponsorshipStatus: SelfPaymentSponsorshipStatus = null;
      let endsAt: string | null = null;
      if (account) {
        // A mais recente: nunca há mais de uma cobrável de uma vez (unique
        // parcial da RPC), mas o histórico pode ter uma `canceled` antiga.
        const { data: sponsorship, error } = await client
          .from("sponsorships")
          .select("status, ends_at")
          .eq("sponsor_id", account.id)
          .eq("church_id", churchId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SponsorshipRow>();
        if (error) throw new AppError("internal_error", "Falha ao carregar o autopatrocínio", error);
        sponsorshipStatus = sponsorship?.status ?? null;
        endsAt = sponsorship?.ends_at ?? null;
      }

      return {
        realSponsorCount: (countResult.data as number) ?? 0,
        account,
        sponsorshipStatus,
        endsAt,
        aceitaPatrocinio: churchResult.data?.aceita_patrocinio ?? true,
        amountCents: (amountResult.data as number) ?? 0,
        openInvoiceUrl: faturaResult.error ? null : ((faturaResult.data as string | null) ?? null),
      };
    },

    async enable({ churchId, kind, displayName, email, phone, document }): Promise<SponsorAccount> {
      const { data, error } = await client
        .rpc("enable_church_self_payment", {
          p_church_id: churchId,
          p_kind: kind,
          p_display_name: displayName,
          p_email: email,
          p_phone: phone,
          p_document: document,
        })
        .single<SponsorAccount>();
      if (error?.code === "42501") {
        throw new AppError("forbidden", "Você não administra esta igreja.", error);
      }
      if (error?.code === "P0001") {
        throw new AppError("conflict", error.message, error);
      }
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao ativar o autopatrocínio", error);
      }
      return data;
    },

    async setAceitaPatrocinio(churchId, aceita): Promise<void> {
      const { error } = await client.rpc("set_church_aceita_patrocinio", {
        p_church_id: churchId,
        p_aceita: aceita,
      });
      if (error?.code === "42501") {
        throw new AppError("forbidden", "Você não administra esta igreja.", error);
      }
      if (error?.code === "P0001") {
        throw new AppError("conflict", error.message, error);
      }
      if (error) {
        throw new AppError("internal_error", "Falha ao salvar a preferência", error);
      }
    },
  };
}
