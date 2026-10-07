import { isAppError } from "@/lib/errors";
import { isAutomatedVisit, type VisitOrigin } from "@/lib/churchVisits";

/**
 * Contagem de visitas à página pública e as leituras dela (patrocinador e
 * plataforma).
 *
 * Gravar NUNCA pode derrubar a página: quem chegou pelo QR Code quer ver a
 * igreja, não um erro de métrica. Toda falha aqui é engolida e logada.
 */

export interface ChurchVisitRepository {
  insertVisit(input: { churchId: string; origem: VisitOrigin }): Promise<void>;
}

/** Deduplicação: a mesma pessoa recarregando não vira duas visitas. */
export interface VisitDeduper {
  /** true = primeira vez nesta janela (deve contar). */
  firstInWindow(key: string): Promise<boolean>;
}

export interface VisitRequest {
  churchId: string;
  origem: VisitOrigin;
  /** Identificador da pessoa só para deduplicar (hash de IP). Nunca é gravado. */
  visitorKey: string | null;
  userAgent: string | null;
  purpose: string | null;
  nextPrefetch: string | null;
}

interface Logger {
  error(message: string, meta?: unknown): void;
}

export function createChurchVisitService(deps: {
  repo: ChurchVisitRepository;
  deduper: VisitDeduper;
  log?: Logger;
}) {
  const log = deps.log ?? console;

  return {
    /** Devolve se a visita foi gravada (para teste; a página não usa). */
    async record(request: VisitRequest): Promise<boolean> {
      try {
        if (isAutomatedVisit(request)) return false;

        if (request.visitorKey) {
          const primeira = await deps.deduper.firstInWindow(`${request.churchId}:${request.visitorKey}`);
          if (!primeira) return false;
        }

        await deps.repo.insertVisit({ churchId: request.churchId, origem: request.origem });
        return true;
      } catch (err) {
        log.error("[church-visit] falha ao registrar visita", isAppError(err) ? err.message : err);
        return false;
      }
    },
  };
}

export type ChurchVisitService = ReturnType<typeof createChurchVisitService>;
