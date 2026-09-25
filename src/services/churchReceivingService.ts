import { z } from "zod";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/brDocument";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type {
  DonationWebhookEvent,
  ReceivingAccountStatus,
} from "@/adapters/payment/ReceivingProvider";

/**
 * Recebimento por cartão da igreja, pela subconta dela no provedor.
 *
 * As duas regras que mandam neste arquivo:
 *
 * 1. O dinheiro não é nosso. A subconta é da igreja, a cobrança nasce dentro
 *    dela e a plataforma não tira taxa. Nada aqui cria repasse ou split.
 *
 * 2. Quem aprova é o provedor. A igreja preenche o cadastro e escolhe se quer
 *    cartão na página; ela NÃO decide que está aprovada. Por isso o status só
 *    entra pelo caminho do servidor, e o "aceitar cartão" dela só vale com a
 *    conta aprovada.
 */

export type ReceivingStatus =
  | "nao_iniciado"
  | "pendente_envio"
  | "em_analise"
  | "aprovada"
  | "recusada"
  | "suspensa";

export interface ChurchReceivingAccount {
  id: string;
  churchId: string;
  churchName: string;
  razaoSocial: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  enderecoNumero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  nascimento: string | null;
  rendaMensalCents: number | null;
  provider: string | null;
  status: ReceivingStatus;
  externalAccountId: string | null;
  linkDoacao: string | null;
  motivoRecusa: string | null;
  aceitaCartao: boolean;
}

export interface ChurchReceivingRepository {
  listCompanyChurches(companyId: string): Promise<Array<{ id: string; name: string }>>;
  findByChurch(companyId: string, churchId: string): Promise<ChurchReceivingAccount | null>;
  listByCompany(companyId: string): Promise<ChurchReceivingAccount[]>;
  /** Cria ou atualiza os dados do cadastro (escrita da igreja). */
  saveRegistration(input: {
    companyId: string;
    churchId: string;
    razaoSocial: string;
    documento: string;
    email: string;
    telefone: string;
    cep: string;
    endereco: string;
    enderecoNumero: string;
    bairro: string;
    cidade: string;
    uf: string;
    nascimento: string | null;
    rendaMensalCents: number;
  }): Promise<ChurchReceivingAccount>;
  setAceitaCartao(companyId: string, churchId: string, aceita: boolean): Promise<boolean>;
  /** Escrita do SERVIDOR: status, ids do provedor e segredos. */
  saveProviderResult(input: {
    churchId: string;
    provider: string;
    status: ReceivingStatus;
    externalAccountId: string;
    externalWalletId: string | null;
    apiKeyCifrada: string | null;
    webhookTokenHash: string;
  }): Promise<void>;
  updateStatus(churchId: string, status: ReceivingStatus): Promise<void>;
  setDonationLink(churchId: string, url: string): Promise<void>;
  /**
   * Chave de API da subconta, ainda cifrada. Sai do banco só por aqui, e
   * quem chama é o servidor — a coluna nem tem GRANT de leitura para o
   * client.
   */
  getSealedApiKey(churchId: string): Promise<string | null>;
}

export interface ReceivingActor {
  companyId: string;
  role: RoleCode;
  userId: string;
}

const QUEM_CONFIGURA: RoleCode[] = ["owner", "admin"];

export function canConfigureReceiving(role: RoleCode): boolean {
  return QUEM_CONFIGURA.includes(role);
}

/** O cartão só aparece na página quando as três coisas valem juntas. */
export function cartaoAtivo(conta: {
  status: ReceivingStatus;
  aceitaCartao: boolean;
  linkDoacao: string | null;
}): boolean {
  return conta.status === "aprovada" && conta.aceitaCartao && Boolean(conta.linkDoacao);
}

/** CPF (11) ou CNPJ (14). */
export function documentoValido(documento: string): boolean {
  const digitos = onlyDigits(documento);
  if (digitos.length === 11) return isValidCpf(digitos);
  if (digitos.length === 14) return isValidCnpj(digitos);
  return false;
}

const registrationSchema = z
  .object({
    churchId: z.uuid("Igreja inválida"),
    razaoSocial: z
      .string()
      .trim()
      .min(3, "Informe o nome da igreja como está no documento")
      .max(140, "Nome muito longo"),
    documento: z.string().trim().min(11, "Informe o CNPJ ou CPF"),
    email: z.email("E-mail inválido"),
    telefone: z.string().trim().min(10, "Informe um telefone com DDD").max(20, "Telefone inválido"),
    cep: z.string().trim().min(8, "Informe o CEP"),
    endereco: z.string().trim().min(3, "Informe o endereço").max(140, "Endereço muito longo"),
    enderecoNumero: z.string().trim().min(1, "Informe o número").max(10, "Número inválido"),
    bairro: z.string().trim().min(2, "Informe o bairro").max(80, "Bairro muito longo"),
    cidade: z.string().trim().min(2, "Informe a cidade").max(80, "Cidade muito longa"),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "UF inválida"),
    /** "1980-05-02"; o provedor exige quando o documento é CPF. */
    nascimento: z.string().trim(),
    /** Texto livre tipo "R$ 5.000,00"; parseado para centavos abaixo. */
    rendaMensal: z.string().trim().max(20, "Valor inválido"),
  })
  .transform((v) => ({ ...v, documento: onlyDigits(v.documento), cep: onlyDigits(v.cep) }))
  .superRefine((v, ctx) => {
    if (!documentoValido(v.documento)) {
      ctx.addIssue({ code: "custom", path: ["documento"], message: "CNPJ ou CPF inválido" });
    }
    if (v.cep.length !== 8) {
      ctx.addIssue({ code: "custom", path: ["cep"], message: "CEP inválido" });
    }
    // Conta de pessoa física exige nascimento; a de empresa, não.
    if (v.documento.length === 11 && !/^\d{4}-\d{2}-\d{2}$/.test(v.nascimento)) {
      ctx.addIssue({
        code: "custom",
        path: ["nascimento"],
        message: "Informe a data de nascimento do responsável",
      });
    }
    // O Asaas exige (incomeValue); sem valor válido, a criação da subconta falha lá na frente.
    const rendaCents = parseBrlToCents(v.rendaMensal);
    if (!rendaCents) {
      ctx.addIssue({
        code: "custom",
        path: ["rendaMensal"],
        message: "Informe a renda/faturamento mensal — o provedor exige para abrir a conta",
      });
    }
  });

/** O que o service usa do adapter (porta; a implementação vive em adapters). */
export interface ReceivingProviderPort {
  readonly name: string;
  createAccount(input: {
    razaoSocial: string;
    documento: string;
    email: string;
    telefone: string;
    cep: string;
    endereco: string;
    enderecoNumero: string;
    bairro: string;
    cidade: string;
    uf: string;
    nascimento: string | null;
    rendaMensalCents: number;
    webhookUrl: string;
    webhookToken: string;
    site: string;
  }): Promise<{
    accountId: string;
    walletId: string | null;
    apiKey: string | null;
    status: ReceivingAccountStatus;
  }>;
  /** Recebe a chave da PRÓPRIA subconta, não o id (ver ReceivingProvider.ts). */
  getAccountStatus(subApiKey: string): Promise<ReceivingAccountStatus>;
  ensureDonationLink(input: {
    apiKey: string;
    churchName: string;
    successUrl: string;
  }): Promise<{ url: string }>;
}

export interface ReceivingSecrets {
  /** Cifra a chave da subconta antes de ela chegar ao banco. */
  seal(plaintext: string): string;
  open(sealed: string): string;
  /** Token novo do webhook desta igreja, e o hash que fica guardado. */
  newWebhookToken(): { token: string; hash: string };
}

export function createChurchReceivingService(deps: {
  repo: ChurchReceivingRepository;
  provider: ReceivingProviderPort;
  secrets: ReceivingSecrets;
  /** Base para montar as URLs de webhook e de retorno. */
  appUrl: string;
  audit?: {
    record(input: {
      companyId: string;
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
  log?: { error(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;
  const base = deps.appUrl.replace(/\/+$/, "");

  function exigePermissao(actor: ReceivingActor) {
    if (!canConfigureReceiving(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode configurar o recebimento.");
    }
  }

  /** Cria (uma vez) o link de doação DENTRO da subconta da igreja. */
  async function ensureLink(companyId: string, churchId: string): Promise<string | null> {
    const conta = await deps.repo.findByChurch(companyId, churchId);
    if (!conta) throw new AppError("not_found", "Igreja não encontrada.");
    if (conta.linkDoacao) return conta.linkDoacao;
    if (conta.status !== "aprovada") return null;

    const cifrada = await deps.repo.getSealedApiKey(churchId);
    if (!cifrada) {
      throw new AppError(
        "internal_error",
        "A conta desta igreja está sem a chave do provedor. Refaça o cadastro.",
      );
    }

    const { url } = await deps.provider.ensureDonationLink({
      apiKey: deps.secrets.open(cifrada),
      churchName: conta.churchName,
      successUrl: `${base}/igreja/${conta.churchId}`,
    });
    await deps.repo.setDonationLink(churchId, url);
    return url;
  }

  return {
    listChurches(companyId: string) {
      return deps.repo.listCompanyChurches(companyId);
    },

    list(companyId: string): Promise<ChurchReceivingAccount[]> {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return deps.repo.listByCompany(companyId);
    },

    /**
     * Guarda o cadastro E abre a subconta no provedor. Os dados ficam no banco
     * ANTES da chamada de rede: se o provedor recusar, a igreja corrige o que
     * apontarem em vez de digitar tudo de novo.
     */
    async submitRegistration(
      actor: ReceivingActor,
      input: unknown,
    ): Promise<ChurchReceivingAccount> {
      exigePermissao(actor);

      const parsed = registrationSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((c) => c.id === dados.churchId)) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      const existente = await deps.repo.findByChurch(actor.companyId, dados.churchId);
      if (existente && (existente.status === "em_analise" || existente.status === "aprovada")) {
        throw new AppError(
          "conflict",
          existente.status === "aprovada"
            ? "Esta igreja já tem conta de recebimento aprovada."
            : "O cadastro desta igreja já está em análise no provedor.",
        );
      }

      // Já validado no superRefine acima (schema recusa antes de chegar aqui).
      const rendaMensalCents = parseBrlToCents(dados.rendaMensal) ?? 0;

      const conta = await deps.repo.saveRegistration({
        companyId: actor.companyId,
        churchId: dados.churchId,
        razaoSocial: dados.razaoSocial,
        documento: dados.documento,
        email: dados.email,
        telefone: dados.telefone,
        cep: dados.cep,
        endereco: dados.endereco,
        enderecoNumero: dados.enderecoNumero,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        nascimento: dados.nascimento || null,
        rendaMensalCents,
      });

      const { token, hash } = deps.secrets.newWebhookToken();
      const criada = await deps.provider.createAccount({
        razaoSocial: dados.razaoSocial,
        documento: dados.documento,
        email: dados.email,
        telefone: dados.telefone,
        cep: dados.cep,
        endereco: dados.endereco,
        enderecoNumero: dados.enderecoNumero,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        nascimento: dados.nascimento || null,
        rendaMensalCents,
        webhookUrl: `${base}/api/webhooks/donations/${deps.provider.name}`,
        webhookToken: token,
        site: base,
      });

      await deps.repo.saveProviderResult({
        churchId: dados.churchId,
        provider: deps.provider.name,
        status: criada.status,
        externalAccountId: criada.accountId,
        externalWalletId: criada.walletId,
        // A chave só existe cifrada daqui para baixo.
        apiKeyCifrada: criada.apiKey ? deps.secrets.seal(criada.apiKey) : null,
        webhookTokenHash: hash,
      });

      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: "church.receiving.submitted",
          entityType: "church",
          entityId: dados.churchId,
          // Documento não vai para a trilha: ela é lida por toda a equipe.
          metadata: { provider: deps.provider.name, status: criada.status },
        })
        .catch((err) => log.error("[receiving] falha ao registrar auditoria", err));

      if (criada.status === "aprovada") {
        await ensureLink(actor.companyId, dados.churchId).catch((err) =>
          log.error("[receiving] falha ao criar o link de doação", err),
        );
      }

      return (await deps.repo.findByChurch(actor.companyId, dados.churchId)) ?? conta;
    },

    /** Relê a situação no provedor (a análise leva de horas a dias). */
    async syncStatus(actor: ReceivingActor, churchId: string): Promise<ReceivingStatus> {
      exigePermissao(actor);
      const conta = await deps.repo.findByChurch(actor.companyId, churchId);
      if (!conta?.externalAccountId) {
        throw new AppError("not_found", "Esta igreja ainda não tem cadastro enviado.");
      }

      const sealed = await deps.repo.getSealedApiKey(churchId);
      if (!sealed) {
        throw new AppError(
          "internal_error",
          "A chave desta subconta não foi salva. Fale com o suporte.",
        );
      }
      const status = await deps.provider.getAccountStatus(deps.secrets.open(sealed));
      if (status !== conta.status) {
        await deps.repo.updateStatus(churchId, status);
      }
      if (status === "aprovada" && !conta.linkDoacao) {
        await ensureLink(actor.companyId, churchId).catch((err) =>
          log.error("[receiving] falha ao criar o link de doação", err),
        );
      }
      return status;
    },

    /**
     * Liga ou desliga o cartão na página. Ligar sem conta aprovada levaria a
     * um botão que não recebe nada — pior do que não ter botão.
     */
    async setCardEnabled(actor: ReceivingActor, churchId: string, aceita: boolean): Promise<void> {
      exigePermissao(actor);
      const conta = await deps.repo.findByChurch(actor.companyId, churchId);
      if (!conta) throw new AppError("not_found", "Igreja não encontrada.");
      if (aceita && conta.status !== "aprovada") {
        throw new AppError(
          "validation_error",
          "O cartão só pode ser ligado depois que o provedor aprovar a conta da igreja.",
        );
      }
      if (aceita && !conta.linkDoacao) {
        throw new AppError(
          "validation_error",
          "A conta está aprovada, mas o link de doação ainda não ficou pronto. Tente de novo em instantes.",
        );
      }

      if (!(await deps.repo.setAceitaCartao(actor.companyId, churchId, aceita))) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: aceita ? "church.receiving.card_enabled" : "church.receiving.card_disabled",
          entityType: "church",
          entityId: churchId,
          metadata: {},
        })
        .catch((err) => log.error("[receiving] falha ao registrar auditoria", err));
    },
  };
}

export interface DonationStore {
  /** Acha a igreja dona da subconta que mandou o evento. */
  findAccountByExternalId(
    provider: string,
    externalAccountId: string,
  ): Promise<{ churchId: string; webhookTokenHash: string } | null>;
  upsertDonation(input: {
    churchId: string;
    provider: string;
    externalPaymentId: string;
    amountCents: number;
    metodo: "cartao" | "pix" | "boleto" | "outro";
    status: "pendente" | "recebida" | "estornada" | "cancelada";
    pagaEm: string | null;
  }): Promise<void>;
  /** Status da doação já gravada, para não rebaixá-la por evento atrasado. */
  findDonationStatus(provider: string, externalPaymentId: string): Promise<string | null>;
}

/**
 * Aplica um evento de doação. Idempotente e resistente a evento fora de
 * ordem, pelo mesmo motivo do webhook de patrocínio: uma reentrega de
 * "pendente" depois do "recebida" faria o valor sumir do painel da igreja.
 */
export function createDonationWebhookService(deps: {
  store: DonationStore;
  log?: { warn(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;

  return {
    async apply(
      event: DonationWebhookEvent,
      churchId: string,
    ): Promise<"applied" | "ignored" | "stale"> {
      if (event.kind !== "donation" || !event.donation) return "ignored";
      const doacao = event.donation;

      const atual = await deps.store.findDonationStatus(event.provider, doacao.externalPaymentId);
      if (atual === "recebida" && doacao.status === "pendente") {
        log.warn("[doacao] evento atrasado ignorado: doação já recebida", {
          provider: event.provider,
          paymentId: doacao.externalPaymentId,
        });
        return "stale";
      }

      await deps.store.upsertDonation({
        churchId,
        provider: event.provider,
        externalPaymentId: doacao.externalPaymentId,
        amountCents: doacao.amountCents,
        metodo: doacao.metodo,
        status: doacao.status,
        pagaEm: doacao.pagaEm,
      });
      return "applied";
    },
  };
}

export type ChurchReceivingService = ReturnType<typeof createChurchReceivingService>;
export type DonationWebhookService = ReturnType<typeof createDonationWebhookService>;
