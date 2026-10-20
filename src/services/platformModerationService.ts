import { AppError } from "@/lib/errors";
import type {
  AbuseReport,
  HiddenSignal,
  PendingProfileChange,
  PlatformPendingCounts,
  SecurityHold,
} from "@/types/sponsorship";

/**
 * Moderação da plataforma.
 *
 * Quem modera atravessa o isolamento entre tenants por definição: decide
 * sobre um patrocinador que aparece em igrejas de várias empresas. Por isso o
 * acesso não é um papel de empresa e não vem com SELECT nas tabelas dos
 * clientes — são RPCs `security definer` estreitas, cada decisão registrada em
 * `platform_staff_actions`.
 */

/** Como a decisão chegou. O bot do Telegram entra aqui sem migration nova. */
export type ModerationChannel = "painel" | "telegram" | "api";

export interface PlatformModerationRepository {
  listPendingProfileChanges(): Promise<PendingProfileChange[]>;
  reviewProfileChange(input: {
    changeId: string;
    approved: boolean;
    reason: string | null;
    via: ModerationChannel;
    logoUrl: string | null;
  }): Promise<boolean>;
  listAbuseReports(): Promise<AbuseReport[]>;
  reviewAbuseReport(input: {
    reportId: string;
    procedente: boolean;
    nota: string | null;
    via: ModerationChannel;
  }): Promise<boolean>;
  listHiddenSignals(): Promise<HiddenSignal[]>;
  listSecurityHolds(): Promise<SecurityHold[]>;
  releaseSecurityHold(input: { sponsorAccountId: string; via: ModerationChannel }): Promise<boolean>;
  getPendingCounts(): Promise<PlatformPendingCounts>;
  /** Para onde vão os avisos de fila. */
  listStaffEmails(): Promise<string[]>;
}

export interface ModerationNotifier {
  sendProfileDecision(input: {
    to: string;
    approved: boolean;
    displayName: string;
    reason: string | null;
  }): Promise<void>;
  sendHoldReleased(input: { to: string; displayName: string }): Promise<void>;
}

interface Deps {
  repo: PlatformModerationRepository;
  notifier: ModerationNotifier;
  /**
   * Publica o arquivo pendente e devolve a URL final. Só é chamado quando a
   * alteração aprovada traz logo novo — quem sabe montar URL de storage é o
   * adapter, não o banco.
   */
  publishLogo?: (input: { pendingPath: string; sponsorAccountId: string }) => Promise<string>;
}

export function createPlatformModerationService({ repo, notifier, publishLogo }: Deps) {
  return {
    listPendingProfileChanges(): Promise<PendingProfileChange[]> {
      return repo.listPendingProfileChanges();
    },

    /**
     * Decide uma alteração. Aprovar é o único caminho pelo qual o nome e o
     * logo públicos mudam.
     */
    async reviewProfileChange(input: {
      changeId: string;
      approved: boolean;
      reason?: string | null;
      via?: ModerationChannel;
    }): Promise<void> {
      const changeId = typeof input.changeId === "string" ? input.changeId.trim() : "";
      if (!changeId) {
        throw new AppError("validation_error", "Alteração inválida");
      }

      const reason = input.reason?.trim() || null;
      // Recusa sem motivo deixa o patrocinador sem saber o que corrigir — e
      // ele pagou para estar ali.
      if (!input.approved && !reason) {
        throw new AppError("validation_error", "Diga por que está recusando.");
      }

      const pendentes = await repo.listPendingProfileChanges();
      const alvo = pendentes.find((c) => c.id === changeId);
      if (!alvo) {
        throw new AppError("not_found", "Esta alteração já foi decidida ou não existe.");
      }

      let logoUrl: string | null = null;
      if (input.approved && alvo.novoLogoPath) {
        if (!publishLogo) {
          throw new AppError("internal_error", "Publicação de logo não configurada");
        }
        logoUrl = await publishLogo({
          pendingPath: alvo.novoLogoPath,
          sponsorAccountId: alvo.sponsorAccountId,
        });
      }

      const ok = await repo.reviewProfileChange({
        changeId,
        approved: input.approved,
        reason,
        via: input.via ?? "painel",
        logoUrl,
      });
      if (!ok) {
        throw new AppError("not_found", "Esta alteração já foi decidida ou não existe.");
      }

      await notifier.sendProfileDecision({
        to: alvo.sponsorEmail,
        approved: input.approved,
        displayName: alvo.novoDisplayName ?? alvo.atualDisplayName,
        reason,
      });
    },

    listAbuseReports(): Promise<AbuseReport[]> {
      return repo.listAbuseReports();
    },

    /**
     * Decide uma denúncia. Decidir aqui NÃO esconde o patrocinador de página
     * nenhuma: quem faz isso é cada igreja, por conta própria. O que a
     * moderação resolve é o caso — se a marca precisa sair de todo lugar, o
     * caminho é agir sobre a conta, e isso é decisão consciente, não efeito
     * colateral de fechar um chamado.
     */
    async reviewAbuseReport(input: {
      reportId: string;
      procedente: boolean;
      nota?: string | null;
      via?: ModerationChannel;
    }): Promise<void> {
      const reportId = typeof input.reportId === "string" ? input.reportId.trim() : "";
      if (!reportId) {
        throw new AppError("validation_error", "Denúncia inválida");
      }

      const ok = await repo.reviewAbuseReport({
        reportId,
        procedente: input.procedente,
        nota: input.nota?.trim() || null,
        via: input.via ?? "painel",
      });
      if (!ok) {
        throw new AppError("not_found", "Esta denúncia já foi decidida ou não existe.");
      }
    },

    listHiddenSignals(): Promise<HiddenSignal[]> {
      return repo.listHiddenSignals();
    },

    listSecurityHolds(): Promise<SecurityHold[]> {
      return repo.listSecurityHolds();
    },

    /** Números para os badges do menu — só o que tem ação a tomar. */
    getPendingCounts(): Promise<PlatformPendingCounts> {
      return repo.getPendingCounts();
    },

    /**
     * Libera a conta travada pelo "não fui eu". Não republica o que foi
     * desfeito nem devolve nada ao ar: só permite pedir de novo, e o próximo
     * pedido passa pela fila como qualquer outro. Republicar aqui seria
     * decidir pelo dono da conta, justamente no caso em que há dúvida sobre
     * quem é o dono.
     */
    async releaseSecurityHold(input: {
      sponsorAccountId: string;
      via?: ModerationChannel;
    }): Promise<void> {
      const id = typeof input.sponsorAccountId === "string" ? input.sponsorAccountId.trim() : "";
      if (!id) throw new AppError("validation_error", "Conta inválida");

      const travadas = await repo.listSecurityHolds();
      const alvo = travadas.find((c) => c.sponsorAccountId === id);
      if (!alvo) {
        throw new AppError("not_found", "Esta conta não está bloqueada.");
      }

      const ok = await repo.releaseSecurityHold({
        sponsorAccountId: id,
        via: input.via ?? "painel",
      });
      if (!ok) {
        throw new AppError("not_found", "Esta conta não está bloqueada.");
      }

      await notifier.sendHoldReleased({ to: alvo.email, displayName: alvo.displayName });
    },
  };
}

export type PlatformModerationService = ReturnType<typeof createPlatformModerationService>;
