import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import {
  MODULOS_DESLIGAVEIS,
  escolhasModulosParaGravar,
  resolverModulos,
  type CelulaModulo,
  type LinhaModulo,
  type ModuloDesligavel,
} from "@/lib/menuPermissoes";
import type { RoleCode } from "@/types/database";

/**
 * Módulos ativos por igreja: liga/desliga acima do cargo. Desligado, o
 * módulo some do menu de todo mundo — inclusive Responsável/Administrador —
 * e nem aparece como opção pra liberar por cargo. Mesma herança de
 * [menuPermissoesService.ts](./menuPermissoesService.ts): a igreja acima
 * define um padrão, a rede segue até alguém mexer.
 */

export interface ModuloAtivoRepository {
  /** Linhas da própria igreja (nivel 0) e das acima — RPC modulos_ativos_da_rede. */
  listarDaRede(companyId: string): Promise<LinhaModulo[]>;
  /** Substitui as exceções da própria igreja — RPC salvar_modulos_ativos. */
  salvar(companyId: string, itens: Array<{ modulo: ModuloDesligavel; ativo: boolean }>): Promise<void>;
}

export interface ModuloAtivoActor {
  companyId: string;
  role: RoleCode;
}

/** Responsável OU Administrador — diferente do cargo, que é só Responsável. */
export function podeConfigurarModulos(role: RoleCode | string): boolean {
  return role === "owner" || role === "admin";
}

const desejadoSchema = z
  .array(z.object({ modulo: z.enum(MODULOS_DESLIGAVEIS, "Módulo inválido"), ativo: z.boolean() }))
  .max(50, "Lista de módulos longa demais");

export function createModuloAtivoService(repo: ModuloAtivoRepository) {
  function exigeGestao(actor: ModuloAtivoActor) {
    if (!actor.companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
    if (!podeConfigurarModulos(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja liga ou desliga módulos.");
    }
  }

  return {
    /** Matriz de módulo → estado, para a tela de configuração. */
    async matriz(actor: ModuloAtivoActor): Promise<Map<ModuloDesligavel, CelulaModulo>> {
      exigeGestao(actor);
      const linhas = await repo.listarDaRede(actor.companyId);
      return resolverModulos(linhas);
    },

    /** Grava o desejado como configuração própria e inteira da igreja. */
    async salvar(actor: ModuloAtivoActor, desejado: unknown): Promise<number> {
      exigeGestao(actor);
      const parsed = desejadoSchema.safeParse(desejado);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const linhas = await repo.listarDaRede(actor.companyId);
      const itens = escolhasModulosParaGravar(parsed.data, linhas);
      await repo.salvar(actor.companyId, itens);
      return itens.length;
    },
  };
}

export type ModuloAtivoService = ReturnType<typeof createModuloAtivoService>;
