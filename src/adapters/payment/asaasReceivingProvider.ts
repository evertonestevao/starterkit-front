import { AppError } from "@/lib/errors";
import { centsToReais, reaisToCents } from "./asaasBillingProvider";
import type {
  DonationWebhookEvent,
  ReceivingAccount,
  ReceivingAccountStatus,
  ReceivingProvider,
} from "./ReceivingProvider";

/**
 * Subconta Asaas ("conta filha") para a igreja receber por cartão.
 *
 * O desenho que importa: a conta é da IGREJA. A plataforma cria a subconta
 * com a chave dela (conta-mãe), recebe de volta a chave da subconta e, daí em
 * diante, TODA cobrança é criada com a chave da subconta. O dinheiro nasce
 * dentro da conta da igreja — não há split, não há repasse e não há um
 * instante sequer em que o valor esteja com a plataforma.
 *
 * NADA AQUI FOI VALIDADO CONTRA UMA CONTA ASAAS REAL. Os campos e verbos
 * vieram da documentação; antes de ligar em produção é obrigatório rodar em
 * sandbox e conferir, no mínimo:
 *   - o corpo aceito por POST /accounts e o formato de `birthDate`/`companyType`;
 *   - se a chave da subconta volta em `apiKey` na criação (ela não é
 *     recuperável depois — se não vier, o desenho do link de doação muda);
 *   - o status inicial e os valores de `status` em GET /accounts/{id};
 *   - se POST /paymentLinks aceita valor livre (doação sem valor fixo);
 *   - o header e o corpo do webhook da subconta;
 *   - se POST /customers exige cpfCnpj mesmo para um cliente mínimo (o
 *     formulário de doação de campanha não coleta documento);
 *   - se o webhook de PAYMENT_RECEIVED/CONFIRMED traz `netValue` (valor já
 *     líquido da taxa) — se não trouxer, o valor líquido de uma doação por
 *     cartão fica desconhecido até ajustar isto.
 */

export const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

export interface AsaasReceivingConfig {
  /** Chave da conta-mãe: é ela que abre subcontas. */
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface AsaasAccount {
  id?: string;
  walletId?: string;
  apiKey?: string;
  accountStatus?: string;
  status?: string;
}

/** Status do Asaas -> nosso. Desconhecido vira "em_analise" (conservador). */
export function mapAsaasAccountStatus(status: string | undefined): ReceivingAccountStatus {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
    case "ACTIVE":
      return "aprovada";
    case "REJECTED":
    case "DENIED":
      return "recusada";
    case "BLOCKED":
    case "SUSPENDED":
    case "DISABLED":
      return "suspensa";
    default:
      return "em_analise";
  }
}

const PAGOS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const ESTORNADOS = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

export function mapAsaasDonationStatus(
  status: string | undefined,
  event: string,
): "pendente" | "recebida" | "estornada" | "cancelada" {
  if (event === "PAYMENT_DELETED") return "cancelada";
  if (!status) return "pendente";
  if (PAGOS.has(status)) return "recebida";
  if (ESTORNADOS.has(status)) return "estornada";
  return "pendente";
}

export function mapAsaasBillingType(tipo: string | undefined): "cartao" | "pix" | "boleto" | "outro" {
  switch (tipo) {
    case "CREDIT_CARD":
    case "DEBIT_CARD":
      return "cartao";
    case "PIX":
      return "pix";
    case "BOLETO":
      return "boleto";
    default:
      return "outro";
  }
}

export function createAsaasReceivingProvider(config: AsaasReceivingConfig): ReceivingProvider {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = (config.baseUrl ?? ASAAS_SANDBOX_URL).replace(/\/+$/, "");

  async function request<T>(
    path: string,
    method: "GET" | "POST",
    apiKey: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers: {
          access_token: apiKey,
          "User-Agent": "tag-igreja",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new AppError(
        "payment_error",
        "Não foi possível falar com o provedor de pagamentos agora. Tente de novo em instantes.",
        err,
      );
    }

    const data = (await res.json().catch(() => ({}))) as T & {
      errors?: Array<{ code?: string; description?: string }>;
    };
    if (!res.ok) {
      // Só o código do erro vai para o log; o corpo pode trazer dado do
      // cadastro da igreja, e a chave nunca está aqui (vai no header).
      throw new AppError("payment_error", "O provedor recusou o cadastro.", {
        status: res.status,
        errors: data.errors?.map((e) => e.code ?? e.description),
      });
    }
    return data;
  }

  return {
    name: "asaas",

    async createAccount(input): Promise<ReceivingAccount> {
      const pessoaFisica = input.documento.length === 11;
      const data = await request<AsaasAccount>("/accounts", "POST", config.apiKey, {
        name: input.razaoSocial,
        email: input.email,
        cpfCnpj: input.documento,
        mobilePhone: input.telefone,
        address: input.endereco,
        addressNumber: input.enderecoNumero,
        province: input.bairro,
        postalCode: input.cep,
        // Conta de pessoa exige nascimento; a de empresa, o tipo.
        ...(pessoaFisica
          ? { birthDate: input.nascimento ?? undefined }
          : { companyType: "ASSOCIATION" }),
        webhooks: [
          {
            name: "tag-igreja",
            url: input.webhookUrl,
            email: input.email,
            enabled: true,
            interrupted: false,
            authToken: input.webhookToken,
            sendType: "SEQUENTIALLY",
            events: [
              "PAYMENT_CREATED",
              "PAYMENT_RECEIVED",
              "PAYMENT_CONFIRMED",
              "PAYMENT_REFUNDED",
              "PAYMENT_DELETED",
            ],
          },
        ],
      });

      if (!data.id) {
        throw new AppError("payment_error", "O provedor não devolveu a subconta criada.");
      }
      return {
        accountId: data.id,
        walletId: data.walletId ?? null,
        // Sem a chave, nenhuma cobrança nasce dentro da subconta: o service
        // trata isso como cadastro incompleto em vez de seguir quebrado.
        apiKey: data.apiKey ?? null,
        status: mapAsaasAccountStatus(data.accountStatus ?? data.status),
      };
    },

    async getAccountStatus(accountId) {
      const data = await request<AsaasAccount>(
        `/accounts/${encodeURIComponent(accountId)}`,
        "GET",
        config.apiKey,
      );
      return mapAsaasAccountStatus(data.accountStatus ?? data.status);
    },

    async createDonationCharge({ apiKey, amountCents, externalReference, description, payer }) {
      // A Asaas cobra em cima de um "customer". O formulário de doação não
      // coleta CPF/CNPJ, então criamos um cliente mínimo (nome + telefone).
      // NÃO TESTADO: se a conta exigir cpfCnpj mesmo assim, este passo falha
      // e precisa de ajuste — ver a ressalva no topo do arquivo.
      const cliente = await request<{ id?: string }>("/customers", "POST", apiKey, {
        name: payer?.name ?? "Doador",
        mobilePhone: payer?.phone,
        externalReference,
      });
      if (!cliente.id) {
        throw new AppError("payment_error", "O provedor não devolveu o cliente criado.");
      }

      // Cobrança de hoje, com o valor fixo: quem doa já escolheu o valor na
      // tela, diferente do link reaproveitável de ensureDonationLink.
      const hoje = new Date().toISOString().slice(0, 10);
      const pagamento = await request<{ id?: string; invoiceUrl?: string }>(
        "/payments",
        "POST",
        apiKey,
        {
          customer: cliente.id,
          billingType: "CREDIT_CARD",
          value: centsToReais(amountCents),
          dueDate: hoje,
          description,
          externalReference,
        },
      );
      if (!pagamento.id || !pagamento.invoiceUrl) {
        throw new AppError("payment_error", "O provedor não devolveu a cobrança criada.");
      }
      return { checkoutUrl: pagamento.invoiceUrl, externalId: pagamento.id };
    },

    async ensureDonationLink({ apiKey, churchName, successUrl }) {
      // Criado com a chave da SUBCONTA: o link pertence à igreja, e o dinheiro
      // dele cai lá dentro.
      const data = await request<{ id?: string; url?: string }>("/paymentLinks", "POST", apiKey, {
        name: `Dízimos e ofertas — ${churchName}`,
        billingType: "CREDIT_CARD",
        chargeType: "DETACHED",
        // Sem valor: quem doa escolhe quanto.
        callback: { successUrl, autoRedirect: true },
      });
      if (!data.url) {
        throw new AppError("payment_error", "O provedor não devolveu o link de doação.");
      }
      return { url: data.url };
    },

    readAccountReference(rawBody) {
      try {
        const payload = JSON.parse(rawBody) as { account?: string; payment?: { account?: string } };
        return payload.account ?? payload.payment?.account ?? null;
      } catch {
        return null;
      }
    },

    async parseWebhook({ rawBody, headers, verifyToken }): Promise<DonationWebhookEvent> {
      // Cada subconta tem o SEU token (definido na criação): um vazamento de
      // token derruba a confiança de uma igreja, não a de todas.
      if (!verifyToken(headers.get("asaas-access-token") ?? "")) {
        throw new AppError("unauthorized", "Webhook não autenticado");
      }

      let payload: {
        event?: string;
        payment?: {
          id?: string;
          value?: number;
          netValue?: number;
          status?: string;
          billingType?: string;
          paymentDate?: string | null;
          confirmedDate?: string | null;
          subscription?: string | null;
          externalReference?: string | null;
        };
      };
      try {
        payload = JSON.parse(rawBody) as typeof payload;
      } catch {
        throw new AppError("validation_error", "Webhook com corpo inválido");
      }

      const event = payload.event ?? "";
      const pagamento = payload.payment;
      if (!event.startsWith("PAYMENT_") || !pagamento?.id || typeof pagamento.value !== "number") {
        return { kind: "ignored", provider: "asaas" };
      }

      const status = mapAsaasDonationStatus(pagamento.status, event);
      const data = pagamento.confirmedDate ?? pagamento.paymentDate;
      return {
        kind: "donation",
        provider: "asaas",
        donation: {
          externalPaymentId: pagamento.id,
          amountCents: reaisToCents(pagamento.value),
          metodo: mapAsaasBillingType(pagamento.billingType),
          status,
          pagaEm: status === "recebida" && data ? new Date(`${data}T12:00:00Z`).toISOString() : null,
          externalReference: pagamento.externalReference ?? null,
          // NÃO TESTADO: se a Asaas não mandar netValue neste evento, quem
          // chama decide (ex.: tratar líquido = bruto, taxa desconhecida).
          netAmountCents: typeof pagamento.netValue === "number" ? reaisToCents(pagamento.netValue) : null,
        },
      };
    },
  };
}

// Reexportado para quem monta valores em reais fora daqui (telas de teste).
export { centsToReais };
