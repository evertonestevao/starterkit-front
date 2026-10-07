import { AppError } from "@/lib/errors";
import type { MesDaRede, PainelDaRede, SemanaDaRede, UnidadeDaRede } from "@/lib/painelRede";
import type { RoleCode } from "@/types/database";

/**
 * Painel da rede: os números das igrejas de baixo, para quem administra a
 * igreja de cima. O banco decide o que sobe (só números; da tesouraria, só o
 * total; a mensalidade, só para o Responsável) — este service repete a
 * checagem de papel para falhar cedo e com mensagem clara.
 */

export interface RedePainelRepository {
  /** RPC rede_tem_unidades. */
  temUnidades(companyId: string): Promise<boolean>;
  /** RPC rede_painel_unidades: o retrato de hoje, uma linha por unidade. */
  unidades(companyId: string): Promise<UnidadeDaRede[]>;
  /** RPC rede_painel_semanas: presença por semana, das últimas 12. */
  semanas(companyId: string): Promise<SemanaDaRede[]>;
  /** RPC rede_painel_meses: totais por mês, dos últimos 6. */
  meses(companyId: string): Promise<MesDaRede[]>;
}

export interface RedeActor {
  companyId: string;
  role: RoleCode;
}

const administra = (role: RoleCode) => role === "owner" || role === "admin";

export function createRedePainelService(repo: RedePainelRepository) {
  return {
    /** A igreja tem unidades abaixo? Quem não administra recebe sempre "não". */
    async temUnidades(actor: RedeActor): Promise<boolean> {
      if (!administra(actor.role)) return false;
      return repo.temUnidades(actor.companyId);
    },

    async carregar(actor: RedeActor): Promise<PainelDaRede> {
      if (!administra(actor.role)) {
        throw new AppError("forbidden", "O painel da rede é de quem administra a igreja.");
      }
      const [unidades, semanas, meses] = await Promise.all([
        repo.unidades(actor.companyId),
        repo.semanas(actor.companyId),
        repo.meses(actor.companyId),
      ]);
      return { unidades, semanas, meses };
    },
  };
}

export type RedePainelService = ReturnType<typeof createRedePainelService>;
