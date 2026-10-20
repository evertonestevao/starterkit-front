import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ChurchReceivingAccount,
  ChurchReceivingRepository,
  DonationStore,
  PixFonte,
  ReceivingStatus,
} from "@/services/churchReceivingService";

/**
 * Subconta de recebimento da igreja.
 *
 * Dois clients, de propósito:
 *   - o do USUÁRIO escreve o cadastro e liga/desliga o cartão (a RLS e os
 *     GRANTs por coluna já limitam a quem administra a empresa dona);
 *   - o de SERVICE_ROLE escreve o que vem do provedor (status, ids, chave
 *     cifrada, link) e lê a chave cifrada, colunas que o client nem pode ler.
 */

/** Colunas que o client pode ler (a chave cifrada e o hash do token ficam fora). */
const COLUNAS =
  "id, church_id, razao_social, documento, email, telefone, cep, endereco, endereco_numero, bairro, cidade, uf, nascimento, renda_mensal_cents, provider, status, external_account_id, link_doacao_cartao, link_doacao_pix, motivo_recusa, aceita_cartao";

interface AccountRow {
  id: string;
  church_id: string;
  razao_social: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  endereco_numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  nascimento: string | null;
  renda_mensal_cents: number | null;
  provider: string | null;
  status: ReceivingStatus;
  external_account_id: string | null;
  link_doacao_cartao: string | null;
  link_doacao_pix: string | null;
  motivo_recusa: string | null;
  aceita_cartao: boolean;
}

function toAccount(
  row: AccountRow,
  igreja: { name: string; publicCode: string; pixFonte: PixFonte },
): ChurchReceivingAccount {
  return {
    id: row.id,
    churchId: row.church_id,
    churchName: igreja.name,
    churchPublicCode: igreja.publicCode,
    razaoSocial: row.razao_social,
    documento: row.documento,
    email: row.email,
    telefone: row.telefone,
    cep: row.cep,
    endereco: row.endereco,
    enderecoNumero: row.endereco_numero,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    nascimento: row.nascimento,
    rendaMensalCents: row.renda_mensal_cents,
    provider: row.provider,
    status: row.status,
    externalAccountId: row.external_account_id,
    linkDoacaoCartao: row.link_doacao_cartao,
    linkDoacaoPix: row.link_doacao_pix,
    motivoRecusa: row.motivo_recusa,
    aceitaCartao: row.aceita_cartao,
    pixFonte: igreja.pixFonte,
  };
}

export function createSupabaseChurchReceivingRepository(
  client: SupabaseClient,
  adminClient: SupabaseClient,
): ChurchReceivingRepository {
  async function churchInfo(
    companyId: string,
  ): Promise<Map<string, { name: string; publicCode: string; pixFonte: PixFonte }>> {
    const { data, error } = await client
      .from("churches")
      .select("id, name, public_code, pix_fonte")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
    return new Map(
      (data ?? []).map((c) => [
        c.id as string,
        {
          name: c.name as string,
          publicCode: c.public_code as string,
          pixFonte: c.pix_fonte as PixFonte,
        },
      ]),
    );
  }

  const IGREJA_VAZIA = { name: "", publicCode: "", pixFonte: "propria" as const };

  return {
    async listCompanyChurches(companyId) {
      const igrejas = await churchInfo(companyId);
      return [...igrejas.entries()].map(([id, { name, publicCode }]) => ({ id, name, publicCode }));
    },

    async listByCompany(companyId) {
      const igrejas = await churchInfo(companyId);
      const { data, error } = await client
        .from("church_payment_accounts")
        .select(COLUNAS)
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao carregar o recebimento", error);
      return ((data ?? []) as AccountRow[]).map((row) =>
        toAccount(row, igrejas.get(row.church_id) ?? IGREJA_VAZIA),
      );
    },

    async findByChurch(companyId, churchId) {
      const igrejas = await churchInfo(companyId);
      if (!igrejas.has(churchId)) return null;
      const { data, error } = await client
        .from("church_payment_accounts")
        .select(COLUNAS)
        .eq("company_id", companyId)
        .eq("church_id", churchId)
        .maybeSingle<AccountRow>();
      if (error) throw new AppError("internal_error", "Falha ao carregar o recebimento", error);
      return data ? toAccount(data, igrejas.get(churchId) ?? IGREJA_VAZIA) : null;
    },

    async saveRegistration(input) {
      const igrejas = await churchInfo(input.companyId);
      const payload = {
        church_id: input.churchId,
        razao_social: input.razaoSocial,
        documento: input.documento,
        email: input.email,
        telefone: input.telefone,
        cep: input.cep,
        endereco: input.endereco,
        endereco_numero: input.enderecoNumero,
        bairro: input.bairro,
        cidade: input.cidade,
        uf: input.uf,
        nascimento: input.nascimento,
        renda_mensal_cents: input.rendaMensalCents,
      };

      // A igreja pode refazer o cadastro depois de uma recusa; por isso é
      // insert OU update, decidido pela linha existente.
      const { data: existente } = await client
        .from("church_payment_accounts")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("church_id", input.churchId)
        .maybeSingle<{ id: string }>();

      const query = existente
        ? client
            .from("church_payment_accounts")
            .update(payload)
            .eq("id", existente.id)
            .eq("company_id", input.companyId)
        : client.from("church_payment_accounts").insert(payload);

      const { data, error } = await query.select(COLUNAS).single<AccountRow>();
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao salvar o cadastro de recebimento", error);
      }
      return toAccount(data, igrejas.get(input.churchId) ?? IGREJA_VAZIA);
    },

    async setAceitaCartao(companyId, churchId, aceita) {
      const { data, error } = await client
        .from("church_payment_accounts")
        .update({ aceita_cartao: aceita })
        .eq("company_id", companyId)
        .eq("church_id", churchId)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao salvar a escolha do cartão", error);
      return (data ?? []).length > 0;
    },

    async setPixFonte(companyId, churchId, fonte) {
      const { data, error } = await client
        .from("churches")
        .update({ pix_fonte: fonte })
        .eq("company_id", companyId)
        .eq("id", churchId)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao salvar a fonte do Pix", error);
      return (data ?? []).length > 0;
    },

    // --- daqui para baixo: só o servidor ------------------------------------
    async saveProviderResult(input) {
      const { error } = await adminClient
        .from("church_payment_accounts")
        .update({
          provider: input.provider,
          status: input.status,
          external_account_id: input.externalAccountId,
          external_wallet_id: input.externalWalletId,
          api_key_cifrada: input.apiKeyCifrada,
          webhook_token_hash: input.webhookTokenHash,
          enviado_em: new Date().toISOString(),
          aprovado_em: input.status === "aprovada" ? new Date().toISOString() : null,
        })
        .eq("church_id", input.churchId);
      if (error) throw new AppError("internal_error", "Falha ao gravar a conta do provedor", error);
    },

    async updateStatus(churchId, status) {
      const { error } = await adminClient
        .from("church_payment_accounts")
        .update({
          status,
          ...(status === "aprovada" ? { aprovado_em: new Date().toISOString() } : {}),
          // Conta que deixa de estar aprovada não pode seguir com o botão de
          // cartão no ar: a igreja receberia clique em link que não cobra.
          ...(status === "aprovada" ? {} : { aceita_cartao: false }),
        })
        .eq("church_id", churchId);
      if (error) throw new AppError("internal_error", "Falha ao atualizar o status", error);
    },

    async setCardDonationLink(churchId, url) {
      const { error } = await adminClient
        .from("church_payment_accounts")
        .update({ link_doacao_cartao: url })
        .eq("church_id", churchId);
      if (error) throw new AppError("internal_error", "Falha ao gravar o link de doação (cartão)", error);
    },

    async setPixDonationLink(churchId, url) {
      const { error } = await adminClient
        .from("church_payment_accounts")
        .update({ link_doacao_pix: url })
        .eq("church_id", churchId);
      if (error) throw new AppError("internal_error", "Falha ao gravar o link de doação (Pix)", error);
    },

    async getSealedApiKey(churchId) {
      const { data, error } = await adminClient
        .from("church_payment_accounts")
        .select("api_key_cifrada")
        .eq("church_id", churchId)
        .maybeSingle<{ api_key_cifrada: string | null }>();
      if (error) throw new AppError("internal_error", "Falha ao ler a chave do provedor", error);
      return data?.api_key_cifrada ?? null;
    },
  };
}

/** Lado do webhook: sem sessão de usuário, tudo com service_role. */
export function createSupabaseDonationStore(adminClient: SupabaseClient): DonationStore {
  return {
    async findAccountByExternalId(provider, externalAccountId) {
      const { data, error } = await adminClient
        .from("church_payment_accounts")
        .select("church_id, webhook_token_hash")
        .eq("provider", provider)
        .eq("external_account_id", externalAccountId)
        .maybeSingle<{ church_id: string; webhook_token_hash: string | null }>();
      if (error) throw new AppError("internal_error", "Falha ao localizar a conta", error);
      if (!data?.webhook_token_hash) return null;
      return { churchId: data.church_id, webhookTokenHash: data.webhook_token_hash };
    },

    async findDonationStatus(provider, externalPaymentId) {
      const { data, error } = await adminClient
        .from("church_donations")
        .select("status")
        .eq("provider", provider)
        .eq("external_payment_id", externalPaymentId)
        .maybeSingle<{ status: string }>();
      if (error) throw new AppError("internal_error", "Falha ao localizar a doação", error);
      return data?.status ?? null;
    },

    async upsertDonation(input) {
      const { error } = await adminClient.from("church_donations").upsert(
        {
          church_id: input.churchId,
          provider: input.provider,
          external_payment_id: input.externalPaymentId,
          amount_cents: input.amountCents,
          metodo: input.metodo,
          status: input.status,
          paga_em: input.pagaEm,
        },
        { onConflict: "provider,external_payment_id" },
      );
      if (error) throw new AppError("internal_error", "Falha ao registrar a doação", error);
    },
  };
}

/** Doações da igreja para o painel dela. */
export function createSupabaseDonationsReader(client: SupabaseClient) {
  return {
    async listByCompany(companyId: string, limit = 20) {
      const { data, error } = await client
        .from("church_donations")
        .select("id, church_id, amount_cents, metodo, status, paga_em, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new AppError("internal_error", "Falha ao carregar as doações", error);
      return ((data ?? []) as Array<{
        id: string;
        church_id: string;
        amount_cents: number;
        metodo: string | null;
        status: string;
        paga_em: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        churchId: row.church_id,
        amountCents: row.amount_cents,
        metodo: row.metodo,
        status: row.status,
        pagaEm: row.paga_em,
        createdAt: row.created_at,
      }));
    },
  };
}
