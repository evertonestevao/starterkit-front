import { z } from "zod";
import { origemDoCargo, ordenarCargos } from "@/lib/cargos";
import { AppError, toValidationError } from "@/lib/errors";
import type { Cargo } from "@/types/cargos";
import type { RoleCode } from "@/types/database";

/**
 * Catálogo de cargos com herança pela hierarquia.
 *
 * - Toda igreja VÊ: os padrões da plataforma, os das igrejas acima e os seus.
 * - Só quem criou EDITA: owner/admin da igreja dona do cargo. Os de cima e os
 *   da plataforma aparecem para uso, nunca para edição.
 * - Remover é desativar (soft delete): quem já tinha o cargo continua com ele
 *   no histórico, mas ele não pode mais ser dado.
 *
 * A RLS repete tudo isso (can_view_cargo, cargos_update_dono).
 */

/** Linha do catálogo como o banco devolve (a RLS já filtrou o que a pessoa vê). */
export interface CargoRow {
  id: string;
  churchId: string | null;
  donoNome: string | null;
  slug: string | null;
  nome: string;
  descricao: string | null;
  unico: boolean;
  ordem: number;
  desativado: boolean;
}

export interface CargosRepository {
  /** Igreja da empresa ativa. */
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  /** Cargos visíveis para a igreja: padrão, de cima e os dela (inclui desativados). */
  listVisiveis(churchId: string): Promise<CargoRow[]>;
  create(churchId: string, input: NovoCargo): Promise<string>;
  /** Só se o cargo for desta igreja. Devolve se alterou. */
  update(churchId: string, cargoId: string, input: Partial<NovoCargo> & { desativado?: boolean }): Promise<boolean>;
  /** Nomes dos cargos da própria pessoa (membro ligado à conta) na empresa. */
  meusCargos(companyId: string): Promise<string[]>;
  /** Nome do Pastor (cargo no rol) de cada igreja pedida que a pessoa administra ou que está abaixo. */
  pastoresDasIgrejas(churchIds: string[]): Promise<Record<string, string>>;
}

export interface NovoCargo {
  nome: string;
  descricao: string | null;
  unico: boolean;
  ordem: number;
}

export interface CargosActor {
  companyId: string;
  role: RoleCode;
}

export function canGerenciarCargos(role: RoleCode): boolean {
  return role === "owner" || role === "admin";
}

const cargoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cargo").max(60, "Nome longo demais"),
  descricao: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(200, "Descrição longa demais").nullable(),
  ),
  unico: z.boolean(),
  ordem: z.number().int().min(0).max(999).default(100),
});

export function createCargosService(repo: CargosRepository) {
  async function igreja(actor: CargosActor) {
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Esta conta ainda não tem uma igreja cadastrada.");
    return church;
  }

  function exigeGestao(actor: CargosActor) {
    if (!canGerenciarCargos(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja cuida dos cargos.");
    }
  }

  /** O cargo é desta igreja? (herdado e padrão não se editam aqui) */
  async function exigeProprio(churchId: string, cargoId: string) {
    const parsed = z.uuid().safeParse(cargoId);
    if (!parsed.success) throw new AppError("validation_error", "Cargo inválido.");
    const cargo = (await repo.listVisiveis(churchId)).find((c) => c.id === cargoId);
    if (!cargo) throw new AppError("not_found", "Cargo não encontrado.");
    if (cargo.churchId !== churchId) {
      throw new AppError(
        "forbidden",
        cargo.churchId === null
          ? "Este é um cargo padrão. Ele não pode ser editado, mas você pode criar um seu."
          : `Este cargo é da ${cargo.donoNome ?? "igreja superior"}. Só ela pode editá-lo.`,
      );
    }
    return cargo;
  }

  async function exigeNomeLivre(churchId: string, nome: string, ignorar?: string) {
    const repetido = (await repo.listVisiveis(churchId)).some(
      (c) =>
        !c.desativado &&
        c.id !== ignorar &&
        c.nome.localeCompare(nome, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (repetido) throw new AppError("conflict", `Já existe o cargo "${nome}" disponível para esta igreja.`);
  }

  return {
    /** Todos os cargos que a igreja vê, já com a origem (padrão, herdado, próprio). */
    async listar(actor: CargosActor): Promise<{ igreja: { id: string; name: string }; cargos: Cargo[] }> {
      const church = await igreja(actor);
      const rows = await repo.listVisiveis(church.id);
      const cargos = rows.map((r): Cargo => ({ ...r, origem: origemDoCargo(r.churchId, church.id) }));
      return { igreja: church, cargos: ordenarCargos(cargos) };
    },

    async criar(actor: CargosActor, input: unknown): Promise<string> {
      exigeGestao(actor);
      const church = await igreja(actor);
      const parsed = cargoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await exigeNomeLivre(church.id, parsed.data.nome);
      return repo.create(church.id, parsed.data);
    },

    async editar(actor: CargosActor, cargoId: string, input: unknown): Promise<void> {
      exigeGestao(actor);
      const church = await igreja(actor);
      await exigeProprio(church.id, cargoId);
      const parsed = cargoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await exigeNomeLivre(church.id, parsed.data.nome, cargoId);
      if (!(await repo.update(church.id, cargoId, parsed.data))) {
        throw new AppError("not_found", "Cargo não encontrado.");
      }
    },

    /** Os cargos de quem está logado, para o painel ("Seu cargo: Pastor"). */
    async meusCargos(actor: CargosActor): Promise<string[]> {
      return repo.meusCargos(actor.companyId);
    },

    /**
     * O Pastor de cada igreja da rede, para a lista de igrejas ligadas. Só
     * owner/admin; a RPC só devolve igrejas abaixo de quem pergunta (ou ela).
     */
    async pastoresDaRede(actor: CargosActor, churchIds: string[]): Promise<Record<string, string>> {
      exigeGestao(actor);
      const ids = z.array(z.uuid()).max(1000).safeParse(churchIds);
      if (!ids.success) throw new AppError("validation_error", "Igrejas inválidas");
      if (ids.data.length === 0) return {};
      return repo.pastoresDasIgrejas(ids.data);
    },

    /** Desativa (ou reativa). Quem já tinha o cargo continua com ele no histórico. */
    async definirAtivo(actor: CargosActor, cargoId: string, ativo: boolean): Promise<void> {
      exigeGestao(actor);
      const church = await igreja(actor);
      const cargo = await exigeProprio(church.id, cargoId);
      if (ativo) await exigeNomeLivre(church.id, cargo.nome, cargoId);
      if (!(await repo.update(church.id, cargoId, { desativado: !ativo }))) {
        throw new AppError("not_found", "Cargo não encontrado.");
      }
    },
  };
}

export type CargosService = ReturnType<typeof createCargosService>;
