import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import { SAUDACAO_MAX, SAUDACAO_MIN, SAUDACAO_PADRAO, limparSaudacao } from "@/lib/saudacao";
import type { RoleCode } from "@/types/database";
import { permissionService } from "./permissionService";

/**
 * Saudação das mensagens prontas da igreja. Ler vale para qualquer pessoa da
 * igreja; trocar é de quem administra (a policy de `churches` confere de novo).
 */

export interface SaudacaoRepository {
  /** Igreja da empresa (a primeira) e a saudação gravada (null = padrão). */
  get(companyId: string): Promise<{ churchId: string; saudacao: string | null } | null>;
  /** `saudacao` null volta ao padrão. Devolve false se a igreja não é desta empresa. */
  save(companyId: string, churchId: string, saudacao: string | null): Promise<boolean>;
}

export interface SaudacaoActor {
  companyId: string;
  role: RoleCode;
}

const saudacaoSchema = z
  .string()
  .transform(limparSaudacao)
  .pipe(
    z
      .string()
      .min(SAUDACAO_MIN, `A saudação precisa de pelo menos ${SAUDACAO_MIN} letras`)
      .max(SAUDACAO_MAX, `A saudação pode ter no máximo ${SAUDACAO_MAX} letras`)
      // Vai para dentro de mensagem e de e-mail: só texto simples.
      .regex(/^[\p{L}\p{N} ,.'\-]+$/u, "Use só letras, números, espaço, vírgula e hífen"),
  );

export function createSaudacaoService(repo: SaudacaoRepository) {
  return {
    /** A saudação da igreja da empresa. Falha ao carregar não quebra a tela: cai no padrão. */
    async daEmpresa(companyId: string): Promise<{ churchId: string | null; saudacao: string }> {
      try {
        const r = await repo.get(companyId);
        return { churchId: r?.churchId ?? null, saudacao: r?.saudacao || SAUDACAO_PADRAO };
      } catch (err) {
        console.error("[saudacao] falha ao carregar a saudação; usando o padrão", err);
        return { churchId: null, saudacao: SAUDACAO_PADRAO };
      }
    },

    /** Texto vazio volta ao padrão. Devolve a saudação que passa a valer. */
    async salvar(actor: SaudacaoActor, churchId: unknown, input: unknown): Promise<string> {
      if (!permissionService.canEditCompany(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja altera a saudação.");
      }
      const id = z.uuid("Igreja inválida").safeParse(churchId);
      if (!id.success) throw toValidationError(id.error.issues);

      const vazio = typeof input !== "string" || limparSaudacao(input) === "";
      let saudacao: string | null = null;
      if (!vazio) {
        const parsed = saudacaoSchema.safeParse(input);
        if (!parsed.success) throw toValidationError(parsed.error.issues);
        // Igual ao padrão não precisa ficar gravado.
        saudacao = parsed.data === SAUDACAO_PADRAO ? null : parsed.data;
      }
      if (!(await repo.save(actor.companyId, id.data, saudacao))) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }
      return saudacao ?? SAUDACAO_PADRAO;
    },
  };
}

export type SaudacaoService = ReturnType<typeof createSaudacaoService>;
