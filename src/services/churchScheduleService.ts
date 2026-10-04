import { createScheduleItemSchema, updateScheduleItemSchema } from "@/features/church/schemas";
import { hojeEmBrasilia } from "@/lib/churchSchedule";
import { AppError, toValidationError } from "@/lib/errors";
import type { ChurchScheduleItem } from "@/types/database";
import { canManageEvents, type EventActor } from "./churchEventsService";

/**
 * Programação da igreja no painel: o dia a dia (cultos semanais) e os cultos
 * especiais avulsos. Diferente de Eventos: aqui não há inscrição nem
 * pagamento — é só quando e onde.
 *
 * Quem pode mexer é quem pode publicar evento (dono e administradores).
 */

export interface ScheduleItemWithChurch extends ChurchScheduleItem {
  churchName: string;
  /** Se o culto aparece na chamada (Acompanhamento). */
  registra_chamada: boolean;
}

export interface ChurchScheduleRepository {
  listCompanySchedule(companyId: string): Promise<ScheduleItemWithChurch[]>;
  listCompanyChurches(companyId: string): Promise<Array<{ id: string; name: string }>>;
  insertItem(input: {
    churchId: string;
    titulo: string;
    tipo: "semanal" | "especial";
    diaSemana: number | null;
    data: string | null;
    hora: string;
    descricao: string | null;
    local: string | null;
    registraChamada: boolean;
  }): Promise<string>;
  /** Edição, só se o item for da empresa. Devolve se alterou. */
  updateItem(
    companyId: string,
    itemId: string,
    input: {
      titulo: string;
      tipo: "semanal" | "especial";
      diaSemana: number | null;
      data: string | null;
      hora: string;
      descricao: string | null;
      local: string | null;
      registraChamada: boolean;
    },
  ): Promise<boolean>;
  /** Soft delete, só se o item for da empresa. Devolve se removeu. */
  softDeleteItem(companyId: string, itemId: string): Promise<boolean>;
}

export function createChurchScheduleService(
  repo: ChurchScheduleRepository,
  now: () => Date = () => new Date(),
) {
  function exigePermissao(actor: EventActor) {
    if (!canManageEvents(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode mudar a programação.");
    }
  }

  return {
    list(companyId: string) {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return repo.listCompanySchedule(companyId);
    },

    listChurches(companyId: string) {
      return repo.listCompanyChurches(companyId);
    },

    async addItem(actor: EventActor, input: unknown): Promise<string> {
      exigePermissao(actor);

      const parsed = createScheduleItemSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const igrejas = await repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((i) => i.id === dados.churchId)) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      const especial = dados.tipo === "especial";
      if (especial && dados.data < hojeEmBrasilia(now())) {
        throw new AppError("validation_error", "A data do culto especial já passou.");
      }

      return repo.insertItem({
        churchId: dados.churchId,
        titulo: dados.titulo,
        tipo: dados.tipo,
        diaSemana: especial ? null : Number(dados.diaSemana),
        data: especial ? dados.data : null,
        hora: dados.hora,
        descricao: dados.descricao,
        local: dados.local,
        registraChamada: dados.registraChamada,
      });
    },

    /**
     * Edita um item. A igreja NÃO muda: mover um culto de uma igreja para
     * outra é criar lá e apagar aqui, e misturar as duas coisas num formulário
     * só é como a programação de uma congregação acaba na página de outra.
     */
    async updateItem(actor: EventActor, input: unknown): Promise<void> {
      exigePermissao(actor);

      const parsed = updateScheduleItemSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const especial = dados.tipo === "especial";
      if (especial && dados.data < hojeEmBrasilia(now())) {
        throw new AppError("validation_error", "A data do culto especial já passou.");
      }

      const alterou = await repo.updateItem(actor.companyId, dados.itemId, {
        titulo: dados.titulo,
        tipo: dados.tipo,
        diaSemana: especial ? null : Number(dados.diaSemana),
        data: especial ? dados.data : null,
        hora: dados.hora,
        descricao: dados.descricao,
        local: dados.local,
        registraChamada: dados.registraChamada,
      });
      if (!alterou) throw new AppError("not_found", "Item não encontrado.");
    },

    async removeItem(actor: EventActor, itemId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = typeof itemId === "string" ? itemId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Item inválido.");
      // O filtro por empresa vai junto do update: id de outra igreja não some.
      if (!(await repo.softDeleteItem(actor.companyId, id))) {
        throw new AppError("not_found", "Item não encontrado.");
      }
    },
  };
}

export type ChurchScheduleService = ReturnType<typeof createChurchScheduleService>;
