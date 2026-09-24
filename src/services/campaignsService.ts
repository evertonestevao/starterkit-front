import { createCampaignSchema, updateCampaignSchema, campaignFeedbackSchema } from "@/features/campaigns/schemas";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";

/**
 * Campanhas do lado da IGREJA (painel): criar, editar, ativar, encerrar,
 * registrar a devolutiva e confirmar doação PIX.
 *
 * A RLS já barra quem não administra a igreja; o service repete a checagem
 * de papel (regra do projeto) para responder com mensagem clara em vez de um
 * erro de permissão cru do banco, e valida a ORDEM das transições de status
 * — o banco libera a coluna no GRANT, mas só o service sabe que "encerrada"
 * não pode voltar a "rascunho".
 */

export type CampaignStatus = "rascunho" | "ativa" | "encerrada";
export type CampaignMethod = "pix" | "gateway";

export interface CompanyCampaign {
  id: string;
  churchId: string;
  churchName: string;
  titulo: string;
  fotoCapaUrl: string | null;
  historia: string;
  metaCents: number;
  totalArrecadadoLiquidoCents: number;
  metodoRecebimento: CampaignMethod;
  mostrarProgresso: boolean;
  valoresSugeridos: number[];
  valorPadraoCents: number | null;
  permitirValorLivre: boolean;
  status: CampaignStatus;
  feedbackTexto: string | null;
  feedbackFotoUrl: string | null;
  encerradaAt: string | null;
  createdAt: string;
}

export interface CampaignDonationRow {
  id: string;
  doadorNome: string;
  doadorTelefone: string | null;
  valorBrutoCents: number;
  valorLiquidoCents: number | null;
  taxaCents: number | null;
  metodo: CampaignMethod;
  status: "pendente" | "confirmada" | "recusada";
  createdAt: string;
  confirmadaEm: string | null;
}

export interface CampaignsRepository {
  listCompanyChurches(companyId: string): Promise<Array<{ id: string; name: string }>>;
  /** A igreja tem subconta aprovada no provedor? Só assim uma campanha pode escolher "cartão". */
  isCardReceivingApproved(companyId: string, churchId: string): Promise<boolean>;
  listCampaigns(companyId: string): Promise<CompanyCampaign[]>;
  findCampaign(companyId: string, campaignId: string): Promise<CompanyCampaign | null>;
  insertCampaign(input: {
    churchId: string;
    titulo: string;
    historia: string;
    metaCents: number;
    metodoRecebimento: CampaignMethod;
    mostrarProgresso: boolean;
    permitirValorLivre: boolean;
    valoresSugeridos: number[];
    valorPadraoCents: number | null;
  }): Promise<string>;
  updateCampaign(
    companyId: string,
    campaignId: string,
    input: {
      titulo: string;
      historia: string;
      metaCents: number;
      metodoRecebimento: CampaignMethod;
      mostrarProgresso: boolean;
      permitirValorLivre: boolean;
      valoresSugeridos: number[];
      valorPadraoCents: number | null;
    },
  ): Promise<boolean>;
  setStatus(companyId: string, campaignId: string, status: CampaignStatus, encerradaAt: string | null): Promise<boolean>;
  setFeedback(companyId: string, campaignId: string, feedbackTexto: string | null): Promise<boolean>;
  setCoverUrl(companyId: string, campaignId: string, url: string): Promise<boolean>;
  setFeedbackFotoUrl(companyId: string, campaignId: string, url: string): Promise<boolean>;
  softDeleteCampaign(companyId: string, campaignId: string): Promise<boolean>;
  listDonations(companyId: string, campaignId: string): Promise<CampaignDonationRow[]>;
  /** Chama a RPC `confirmar_doacao_pix` — a RLS confere de novo que é o dono. */
  confirmPixDonation(donationId: string): Promise<void>;
}

export interface CampaignActor {
  companyId: string;
  role: RoleCode;
}

const QUEM_GERENCIA: RoleCode[] = ["owner", "admin"];

export function canManageCampaigns(role: RoleCode): boolean {
  return QUEM_GERENCIA.includes(role);
}

/** Texto opcional de valor (sugestão): vazio = não informado; inválido/zero = erro. */
function parseValorOpcional(texto: string, campo: string): number | null {
  if (!texto.trim()) return null;
  const cents = parseBrlToCents(texto);
  if (cents === null || cents <= 0) {
    throw new AppError("validation_error", `Valor de ${campo} inválido.`);
  }
  return cents;
}

function parseValores(dados: {
  valorSugerido1: string;
  valorSugerido2: string;
  valorSugerido3: string;
  valorPadraoIndice: string;
}): { valoresSugeridos: number[]; valorPadraoCents: number | null } {
  const brutos = [dados.valorSugerido1, dados.valorSugerido2, dados.valorSugerido3].map((t, i) =>
    parseValorOpcional(t, `sugestão ${i + 1}`),
  );
  const valoresSugeridos = brutos.filter((v): v is number => v !== null);

  let valorPadraoCents: number | null = null;
  if (dados.valorPadraoIndice) {
    const idx = Number(dados.valorPadraoIndice) - 1;
    const valor = brutos[idx] ?? null;
    if (valor === null) {
      throw new AppError("validation_error", "Escolha um valor sugerido preenchido como padrão.");
    }
    valorPadraoCents = valor;
  }

  return { valoresSugeridos, valorPadraoCents };
}

/**
 * "Cartão" numa campanha usa a MESMA subconta do recebimento geral da
 * igreja (church_payment_accounts) — não existe uma conta separada por
 * campanha. Por isso só pode escolher esse método quem já tem a subconta
 * aprovada pelo provedor; sem isso a campanha nasceria com um botão que
 * nunca cobra nada.
 */
async function exigeCartaoAprovado(
  repo: CampaignsRepository,
  companyId: string,
  churchId: string,
): Promise<void> {
  if (!(await repo.isCardReceivingApproved(companyId, churchId))) {
    throw new AppError(
      "validation_error",
      "Para receber por cartão, primeiro aprove a subconta desta igreja em Configurações > Cartão.",
    );
  }
}

function parseMeta(texto: string): number {
  const cents = parseBrlToCents(texto);
  if (cents === null || cents <= 0) {
    throw new AppError("validation_error", "Informe a meta da campanha.");
  }
  if (cents > 100_000_000) {
    throw new AppError("validation_error", "Meta muito alta.");
  }
  return cents;
}

export function createCampaignsService(repo: CampaignsRepository, now: () => Date = () => new Date()) {
  function exigePermissao(actor: CampaignActor) {
    if (!canManageCampaigns(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode gerenciar campanhas.");
    }
  }

  return {
    listChurches(companyId: string) {
      return repo.listCompanyChurches(companyId);
    },

    list(companyId: string): Promise<CompanyCampaign[]> {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return repo.listCampaigns(companyId);
    },

    async get(actor: CampaignActor, campaignId: string): Promise<CompanyCampaign> {
      const campanha = await repo.findCampaign(actor.companyId, campaignId);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      return campanha;
    },

    async create(actor: CampaignActor, input: unknown): Promise<string> {
      exigePermissao(actor);
      const parsed = createCampaignSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const igrejas = await repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((i) => i.id === dados.churchId)) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      if (dados.metodoRecebimento === "gateway") {
        await exigeCartaoAprovado(repo, actor.companyId, dados.churchId);
      }

      const metaCents = parseMeta(dados.meta);
      const { valoresSugeridos, valorPadraoCents } = parseValores(dados);

      return repo.insertCampaign({
        churchId: dados.churchId,
        titulo: dados.titulo,
        historia: dados.historia,
        metaCents,
        metodoRecebimento: dados.metodoRecebimento,
        mostrarProgresso: dados.mostrarProgresso,
        permitirValorLivre: dados.permitirValorLivre,
        valoresSugeridos,
        valorPadraoCents,
      });
    },

    async update(actor: CampaignActor, input: unknown): Promise<void> {
      exigePermissao(actor);
      const parsed = updateCampaignSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      if (dados.metodoRecebimento === "gateway") {
        const atual = await repo.findCampaign(actor.companyId, dados.campaignId);
        if (!atual) throw new AppError("not_found", "Campanha não encontrada.");
        await exigeCartaoAprovado(repo, actor.companyId, atual.churchId);
      }

      const metaCents = parseMeta(dados.meta);
      const { valoresSugeridos, valorPadraoCents } = parseValores(dados);

      const alterou = await repo.updateCampaign(actor.companyId, dados.campaignId, {
        titulo: dados.titulo,
        historia: dados.historia,
        metaCents,
        metodoRecebimento: dados.metodoRecebimento,
        mostrarProgresso: dados.mostrarProgresso,
        permitirValorLivre: dados.permitirValorLivre,
        valoresSugeridos,
        valorPadraoCents,
      });
      if (!alterou) throw new AppError("not_found", "Campanha não encontrada.");
    },

    /** Publica a campanha na página da igreja. Só a partir de rascunho. */
    async activate(actor: CampaignActor, campaignId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = typeof campaignId === "string" ? campaignId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Campanha inválida.");

      const campanha = await repo.findCampaign(actor.companyId, id);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      if (campanha.status !== "rascunho") {
        throw new AppError("conflict", "Esta campanha já foi ativada.");
      }

      if (!(await repo.setStatus(actor.companyId, id, "ativa", null))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    /**
     * Encerra a campanha: para de receber, mas continua na página com o
     * resultado. Não recebe mais nenhuma doação nova depois disso (a função
     * pública confere o status).
     */
    async close(actor: CampaignActor, campaignId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = typeof campaignId === "string" ? campaignId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Campanha inválida.");

      const campanha = await repo.findCampaign(actor.companyId, id);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      if (campanha.status !== "ativa") {
        throw new AppError("conflict", "Só uma campanha ativa pode ser encerrada.");
      }

      if (!(await repo.setStatus(actor.companyId, id, "encerrada", now().toISOString()))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    /** Devolutiva (foto + texto) do que foi feito. Só depois de encerrada. */
    async setFeedback(actor: CampaignActor, input: unknown): Promise<void> {
      exigePermissao(actor);
      const parsed = campaignFeedbackSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const campanha = await repo.findCampaign(actor.companyId, dados.campaignId);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      if (campanha.status !== "encerrada") {
        throw new AppError("conflict", "A devolutiva só pode ser escrita depois de encerrar a campanha.");
      }

      if (!(await repo.setFeedback(actor.companyId, dados.campaignId, dados.feedbackTexto))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    async setCover(actor: CampaignActor, campaignId: string, url: string): Promise<void> {
      exigePermissao(actor);
      if (!(await repo.setCoverUrl(actor.companyId, campaignId, url))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    async setFeedbackFoto(actor: CampaignActor, campaignId: string, url: string): Promise<void> {
      exigePermissao(actor);
      const campanha = await repo.findCampaign(actor.companyId, campaignId);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      if (campanha.status !== "encerrada") {
        throw new AppError("conflict", "A foto de devolutiva só pode ser enviada depois de encerrar a campanha.");
      }
      if (!(await repo.setFeedbackFotoUrl(actor.companyId, campaignId, url))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    async remove(actor: CampaignActor, campaignId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = typeof campaignId === "string" ? campaignId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Campanha inválida.");
      if (!(await repo.softDeleteCampaign(actor.companyId, id))) {
        throw new AppError("not_found", "Campanha não encontrada.");
      }
    },

    async listDonations(actor: CampaignActor, campaignId: string): Promise<CampaignDonationRow[]> {
      const campanha = await repo.findCampaign(actor.companyId, campaignId);
      if (!campanha) throw new AppError("not_found", "Campanha não encontrada.");
      return repo.listDonations(actor.companyId, campaignId);
    },

    /** A RLS/RPC já confere de novo quem administra — aqui é só a mensagem clara. */
    async confirmPixDonation(actor: CampaignActor, donationId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = typeof donationId === "string" ? donationId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Doação inválida.");
      await repo.confirmPixDonation(id);
    },
  };
}

export type CampaignsService = ReturnType<typeof createCampaignsService>;
