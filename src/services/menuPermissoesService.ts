import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import {
  MODULOS_LIBERAVEIS,
  escolhasParaGravar,
  resolverAcessos,
  type CelulaAcesso,
  type LinhaAcesso,
  type Modulo,
} from "@/lib/menuPermissoes";
import type { RoleCode } from "@/types/database";

/**
 * Acessos por cargo: o Responsável libera módulos para os cargos da igreja,
 * com herança da igreja acima. Só ele altera (o banco repete:
 * salvar_cargo_acessos).
 */

export interface CargoDaIgreja {
  id: string;
  nome: string;
}

export interface MenuPermissoesRepository {
  /** Linhas da própria igreja (nivel 0) e das acima — RPC cargo_acessos_da_rede. */
  listarDaRede(companyId: string): Promise<LinhaAcesso[]>;
  /** Cargos ativos que esta igreja pode usar (os dela, os herdados e os padrões). */
  listarCargos(companyId: string): Promise<CargoDaIgreja[]>;
  /** Substitui as exceções da própria igreja — RPC salvar_cargo_acessos. */
  salvar(companyId: string, itens: Array<{ cargoId: string; modulo: Modulo; permitido: boolean }>): Promise<void>;
}

export interface AcessosActor {
  companyId: string;
  role: RoleCode;
}

/** Só o Responsável configura: um administrador não libera módulos sozinho. */
export function canConfigurarAcessos(role: RoleCode | string): boolean {
  return role === "owner";
}

const desejadoSchema = z
  .array(
    z.object({
      cargoId: z.uuid("Cargo inválido"),
      modulo: z.enum(MODULOS_LIBERAVEIS, "Módulo inválido"),
      permitido: z.boolean(),
    }),
  )
  .max(500, "Lista de acessos longa demais");

export function createMenuPermissoesService(repo: MenuPermissoesRepository) {
  function exigeResponsavel(actor: AcessosActor) {
    if (!actor.companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
    if (!canConfigurarAcessos(actor.role)) {
      throw new AppError("forbidden", "Só o responsável pela igreja altera os acessos.");
    }
  }

  return {
    /** Cargos da igreja e a matriz cargo × módulo, para a tela de configuração. */
    async matriz(actor: AcessosActor): Promise<{ cargos: CargoDaIgreja[]; matriz: Map<string, CelulaAcesso> }> {
      exigeResponsavel(actor);
      const [cargos, linhas] = await Promise.all([
        repo.listarCargos(actor.companyId),
        repo.listarDaRede(actor.companyId),
      ]);
      return { cargos, matriz: resolverAcessos(cargos.map((c) => c.id), linhas) };
    },

    /**
     * Grava o desejado como configuração própria e inteira da igreja: depois
     * disso, mudanças da igreja acima não chegam mais aqui. Cargo que a
     * igreja não usa é descartado, venha o que vier do form. Devolve quantos
     * pontos ficaram gravados (0 = continua seguindo a de cima).
     */
    async salvar(actor: AcessosActor, desejado: unknown): Promise<number> {
      exigeResponsavel(actor);
      const parsed = desejadoSchema.safeParse(desejado);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const [cargos, linhas] = await Promise.all([
        repo.listarCargos(actor.companyId),
        repo.listarDaRede(actor.companyId),
      ]);
      const itens = escolhasParaGravar(
        parsed.data,
        cargos.map((c) => c.id),
        linhas,
      );
      await repo.salvar(actor.companyId, itens);
      return itens.length;
    },
  };
}

export type MenuPermissoesService = ReturnType<typeof createMenuPermissoesService>;
