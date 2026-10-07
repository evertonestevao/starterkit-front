import { z } from "zod";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError } from "@/lib/errors";

/**
 * Mensalidade por igreja, do lado da PLATAFORMA: a moderação combina um valor
 * próprio com uma igreja (desconto, valor simbólico para a igreja de teste) ou
 * a devolve ao padrão. A igreja nunca escreve o próprio preço — o banco não
 * dá GRANT na coluna e a função confere `is_platform_staff` de novo.
 */

/** Abaixo de R$ 5,00 o provedor de pagamento não emite cobrança. */
export const MENSALIDADE_MIN_CENTS = 500;
export const MENSALIDADE_MAX_CENTS = 1_000_000;

export interface MensalidadeDaIgreja {
  churchId: string;
  /** Null = vale o padrão. */
  valorProprioCents: number | null;
  motivo: string | null;
  valorPadraoCents: number;
  /** A igreja já tem cobrança correndo. */
  pagando: boolean;
}

/** O valor que a igreja paga de fato. */
export function valorEfetivo(m: Pick<MensalidadeDaIgreja, "valorProprioCents" | "valorPadraoCents">): number {
  return m.valorProprioCents ?? m.valorPadraoCents;
}

export interface MensalidadeRepository {
  /** Todas as igrejas (só a moderação recebe alguma linha). */
  listar(): Promise<MensalidadeDaIgreja[]>;
  /** Grava o valor próprio (null = padrão). Devolve a conta de cobrança da igreja, se ela já paga. */
  definir(churchId: string, amountCents: number | null, motivo: string | null): Promise<string | null>;
}

/** Quem atualiza o valor no provedor de pagamento — o `SponsorService` de sistema. */
export interface MensalidadeBiller {
  syncBilling(
    accountId: string,
    options: { createIfMissing: boolean },
  ): Promise<{ syncPending: boolean; reauthorizationNeeded?: boolean }>;
}

const motivoSchema = z.string().trim().min(3, "Informe o motivo do valor diferente").max(200, "Motivo longo demais");

export function createMensalidadeService(deps: {
  repo: MensalidadeRepository;
  biller: MensalidadeBiller;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const { repo, biller } = deps;
  const log = deps.log ?? console;

  return {
    listar(): Promise<MensalidadeDaIgreja[]> {
      return repo.listar();
    },

    /**
     * Define o valor próprio de uma igreja, ou a devolve ao padrão (`valor`
     * vazio). Se ela já paga no cartão, o valor é atualizado no provedor na
     * hora; por Pix Automático (valor fixo), a autorização é cancelada e a
     * igreja autoriza de novo — `precisaAutorizarDeNovo`. Se o provedor falhar,
     * o preço fica gravado e a cobrança é acertada pelo job de sincronização —
     * `cobrancaPendente` avisa a tela.
     */
    async definir(input: {
      churchId: unknown;
      valor: unknown;
      motivo: unknown;
    }): Promise<{ cobrancaPendente: boolean; precisaAutorizarDeNovo: boolean }> {
      const churchId = z.uuid("Igreja inválida").safeParse(input.churchId);
      if (!churchId.success) throw new AppError("validation_error", "Igreja inválida.");

      const bruto = typeof input.valor === "string" ? input.valor.trim() : "";
      let amountCents: number | null = null;
      let motivo: string | null = null;
      if (bruto !== "") {
        const cents = parseBrlToCents(bruto);
        if (cents === null) throw new AppError("validation_error", "Valor inválido.");
        if (cents < MENSALIDADE_MIN_CENTS) {
          throw new AppError("validation_error", "O valor mínimo é R$ 5,00 (abaixo disso a cobrança não é emitida).");
        }
        if (cents > MENSALIDADE_MAX_CENTS) throw new AppError("validation_error", "Valor alto demais.");
        const parsed = motivoSchema.safeParse(input.motivo);
        if (!parsed.success) {
          throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Informe o motivo.");
        }
        amountCents = cents;
        motivo = parsed.data;
      }

      const accountId = await repo.definir(churchId.data, amountCents, motivo);
      if (!accountId) return { cobrancaPendente: false, precisaAutorizarDeNovo: false };
      try {
        const r = await biller.syncBilling(accountId, { createIfMissing: false });
        // Pix Automático é de valor fixo: a autorização antiga foi cancelada e
        // a igreja precisa autorizar de novo, já no valor novo.
        return { cobrancaPendente: r.syncPending, precisaAutorizarDeNovo: r.reauthorizationNeeded === true };
      } catch (err) {
        log.error("[mensalidade] falha ao atualizar o valor no provedor", err);
        return { cobrancaPendente: true, precisaAutorizarDeNovo: false };
      }
    },
  };
}

export type MensalidadeService = ReturnType<typeof createMensalidadeService>;
