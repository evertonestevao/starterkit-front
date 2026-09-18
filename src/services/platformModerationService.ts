import { AppError } from "@/lib/errors";
import type { PendingProfileChange } from "@/types/sponsorship";

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
  };
}

export type PlatformModerationService = ReturnType<typeof createPlatformModerationService>;
