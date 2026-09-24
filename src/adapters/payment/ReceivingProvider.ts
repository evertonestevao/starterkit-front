/**
 * Recebimento DA IGREJA: subconta própria onde o dinheiro do cartão cai.
 *
 * Terceira interface de pagamento do projeto, e as três existem porque são
 * três relações de dinheiro diferentes:
 *   - PaymentGateway ............ assinatura SaaS da empresa (plano fixo)
 *   - RecurringBillingProvider .. patrocínio (valor variável, quem paga é o
 *     patrocinador e o dinheiro é da plataforma)
 *   - ReceivingProvider (este) .. doação para a IGREJA. O dinheiro NUNCA é da
 *     plataforma: nasce e fica na subconta dela, sem split e sem taxa nossa.
 *
 * Regra do projeto: nenhum service ou componente fala com Asaas ou Stripe
 * direto. Provedor novo = implementar esta interface e registrar em
 * src/adapters/payment/index.ts.
 */

export type ReceivingAccountStatus =
  | "em_analise"
  | "aprovada"
  | "recusada"
  | "suspensa";

/** Dados que o provedor exige para abrir a subconta em nome da igreja. */
export interface ReceivingAccountInput {
  /** Nome da igreja como consta no documento. */
  razaoSocial: string;
  /** Só dígitos: CPF (11) ou CNPJ (14). */
  documento: string;
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  enderecoNumero: string;
  bairro: string;
  cidade: string;
  uf: string;
  /** Exigido quando o documento é CPF. */
  nascimento: string | null;
  /** Para onde o provedor manda os eventos desta subconta. */
  webhookUrl: string;
  /** Token que o provedor deve devolver nos webhooks desta subconta. */
  webhookToken: string;
}

export interface ReceivingAccount {
  accountId: string;
  /** Identificador da carteira, quando o provedor tem esse conceito. */
  walletId: string | null;
  /**
   * Chave de API da subconta. O provedor costuma devolvê-la UMA vez, na
   * criação: quem perde, perde o acesso à subconta.
   */
  apiKey: string | null;
  status: ReceivingAccountStatus;
}

/** Evento de doação, já traduzido do formato do provedor. */
export interface DonationWebhookEvent {
  kind: "donation" | "ignored";
  provider: string;
  /** Presente quando kind = "donation". */
  donation?: {
    externalPaymentId: string;
    amountCents: number;
    metodo: "cartao" | "pix" | "boleto" | "outro";
    status: "pendente" | "recebida" | "estornada" | "cancelada";
    pagaEm: string | null;
    /**
     * Referência que a plataforma mandou ao criar a cobrança (ver
     * `createDonationCharge`). É por ela que o webhook decide para qual
     * doação — dízimo avulso ou de uma campanha — o evento é.
     */
    externalReference: string | null;
    /**
     * Valor líquido (já descontada a taxa do provedor), quando ele informa.
     * `null` quando o provedor não devolve isso no webhook — quem chama
     * decide o que fazer (ex.: assumir bruto = líquido, registrando que a
     * taxa é desconhecida).
     */
    netAmountCents: number | null;
  };
}

export interface ReceivingProvider {
  /** Gravado em church_payment_accounts.provider — é assim que a conta acha o seu. */
  readonly name: string;

  /** Abre a subconta em nome da igreja. */
  createAccount(input: ReceivingAccountInput): Promise<ReceivingAccount>;

  /** Situação atual da subconta no provedor (a análise leva horas ou dias). */
  getAccountStatus(accountId: string): Promise<ReceivingAccountStatus>;

  /**
   * Link de doação por cartão da igreja, criado dentro da SUBCONTA (por isso
   * recebe a chave dela). Reaproveitado: um link por igreja, não um por
   * doação — quem doa informa o valor na página do provedor, e nenhum dado
   * pessoal de quem doa passa pela plataforma.
   */
  ensureDonationLink(input: {
    apiKey: string;
    churchName: string;
    successUrl: string;
  }): Promise<{ url: string }>;

  /**
   * Cobrança de VALOR FIXO dentro da subconta, para uma campanha (ou
   * qualquer doação que precise de valor e referência amarrados — diferente
   * do link reaproveitável de `ensureDonationLink`, esta nasce uma vez, para
   * uma doação, e o `externalReference` é o que o webhook usa para achar a
   * doação certa quando o pagamento confirmar.
   */
  createDonationCharge(input: {
    apiKey: string;
    amountCents: number;
    externalReference: string;
    description: string;
    payer?: { name: string; phone?: string };
  }): Promise<{ checkoutUrl: string; externalId: string }>;

  /**
   * Autentica e traduz o webhook da subconta.
   *
   * `verifyToken` recebe o token CRU que veio no header e responde se ele é o
   * daquela igreja. A comparação fica de fora porque o que guardamos é o
   * HASH do token, não ele: o adapter sabe em que header o provedor manda, e
   * o servidor sabe como conferir. Requisição não autenticada deve lançar
   * AppError("unauthorized") — nunca processar evento não verificado.
   */
  parseWebhook(input: {
    rawBody: string;
    headers: Headers;
    verifyToken: (provided: string) => boolean;
  }): Promise<DonationWebhookEvent>;

  /** Só para achar de qual igreja é o evento antes de autenticá-lo. */
  readAccountReference(rawBody: string): string | null;
}
