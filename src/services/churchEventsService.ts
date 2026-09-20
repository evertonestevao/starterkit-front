import { createChurchEventSchema, updateChurchEventSchema } from "@/features/church/schemas";
import { brasiliaLocalToIso, parseBrlToCents } from "@/lib/churchEvents";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";

/**
 * Eventos do lado da IGREJA (painel): os eventos com a contagem de
 * inscritos e a criação de evento.
 *
 * A RLS já barra quem não administra a igreja; o service repete a checagem
 * de papel e de dono (regra do projeto) para responder com mensagem clara em
 * vez de um erro de permissão cru do banco.
 */

export interface CompanyEvent {
  id: string;
  churchId: string;
  churchName: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  local: string | null;
  precoCents: number;
  inscricoesAbertas: boolean;
  inscritos: number;
}

export interface ChurchEventsRepository {
  listCompanyEvents(companyId: string): Promise<CompanyEvent[]>;
  /** Igrejas da empresa, para validar a escolhida e montar o seletor. */
  listCompanyChurches(companyId: string): Promise<Array<{ id: string; name: string; address: string | null }>>;
  /** Edição, só se o evento for da empresa. Devolve se alterou. */
  updateEvent(
    companyId: string,
    eventId: string,
    input: {
      titulo: string;
      descricao: string | null;
      inicio: string;
      fim: string | null;
      local: string | null;
      precoCents: number;
      inscricoesAbertas: boolean;
    },
  ): Promise<boolean>;
  /** Soft delete, só se o evento for da empresa. Devolve se removeu. */
  softDeleteEvent(companyId: string, eventId: string): Promise<boolean>;
  insertEvent(input: {
    churchId: string;
    titulo: string;
    descricao: string | null;
    inicio: string;
    fim: string | null;
    local: string | null;
    precoCents: number;
    inscricoesAbertas: boolean;
  }): Promise<string>;
}

export interface EventActor {
  companyId: string;
  role: RoleCode;
}

const QUEM_PUBLICA: RoleCode[] = ["owner", "admin"];

export function canManageEvents(role: RoleCode): boolean {
  return QUEM_PUBLICA.includes(role);
}

export function createChurchEventsService(
  repo: ChurchEventsRepository,
  now: () => Date = () => new Date(),
) {
  return {
    listForCompany(companyId: string): Promise<CompanyEvent[]> {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return repo.listCompanyEvents(companyId);
    },

    /**
     * Os eventos divididos: próximos (do mais perto ao mais longe) e
     * anteriores (do mais recente ao mais antigo). "Agora" vem do relógio
     * injetado, para a divisão ser testável.
     */
    async getAgenda(companyId: string): Promise<{
      todos: CompanyEvent[];
      proximos: CompanyEvent[];
      anteriores: CompanyEvent[];
    }> {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      const todos = await repo.listCompanyEvents(companyId);
      const agora = now().getTime();
      return {
        todos,
        proximos: todos.filter((e) => new Date(e.inicio).getTime() >= agora),
        anteriores: todos.filter((e) => new Date(e.inicio).getTime() < agora).reverse(),
      };
    },

    listChurches(companyId: string) {
      return repo.listCompanyChurches(companyId);
    },

    async createEvent(actor: EventActor, input: unknown): Promise<string> {
      if (!canManageEvents(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja pode publicar eventos.");
      }

      const parsed = createChurchEventSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      // A igreja escolhida precisa ser DESTA empresa: o id vem do formulário.
      const igrejas = await repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((i) => i.id === dados.churchId)) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      const inicio = brasiliaLocalToIso(dados.inicio);
      if (!inicio) throw new AppError("validation_error", "Data de início inválida.");
      if (new Date(inicio).getTime() <= now().getTime()) {
        throw new AppError("validation_error", "O evento precisa começar no futuro.");
      }

      let fim: string | null = null;
      if (dados.fim) {
        fim = brasiliaLocalToIso(dados.fim);
        if (!fim) throw new AppError("validation_error", "Data de término inválida.");
        if (new Date(fim).getTime() < new Date(inicio).getTime()) {
          throw new AppError("validation_error", "O término não pode ser antes do início.");
        }
      }

      const precoCents = parseBrlToCents(dados.preco);
      if (precoCents === null) {
        throw new AppError("validation_error", "Valor inválido. Use, por exemplo, 180,00.");
      }

      return repo.insertEvent({
        churchId: dados.churchId,
        titulo: dados.titulo,
        descricao: dados.descricao,
        inicio,
        fim,
        local: dados.local,
        precoCents,
        inscricoesAbertas: dados.inscricoesAbertas,
      });
    },

    /**
     * Edita um evento publicado. A igreja não muda (ver o mesmo raciocínio na
     * programação) e o início PODE ficar no passado: corrigir a data de um
     * evento que já começou é justamente o caso em que a igreja mais precisa
     * editar.
     */
    async updateEvent(actor: EventActor, input: unknown): Promise<void> {
      if (!canManageEvents(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja pode editar eventos.");
      }

      const parsed = updateChurchEventSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const inicio = brasiliaLocalToIso(dados.inicio);
      if (!inicio) throw new AppError("validation_error", "Data de início inválida.");

      let fim: string | null = null;
      if (dados.fim) {
        fim = brasiliaLocalToIso(dados.fim);
        if (!fim) throw new AppError("validation_error", "Data de término inválida.");
        if (new Date(fim).getTime() < new Date(inicio).getTime()) {
          throw new AppError("validation_error", "O término não pode ser antes do início.");
        }
      }

      const precoCents = parseBrlToCents(dados.preco);
      if (precoCents === null) {
        throw new AppError("validation_error", "Valor inválido. Use, por exemplo, 180,00.");
      }

      const alterou = await repo.updateEvent(actor.companyId, dados.eventId, {
        titulo: dados.titulo,
        descricao: dados.descricao,
        inicio,
        fim,
        local: dados.local,
        precoCents,
        inscricoesAbertas: dados.inscricoesAbertas,
      });
      if (!alterou) throw new AppError("not_found", "Evento não encontrado.");
    },

    /**
     * Tira o evento do ar (soft delete). As inscrições ficam: quem se
     * inscreveu precisa continuar aparecendo na lista para ser avisado de que
     * o evento foi cancelado.
     */
    async removeEvent(actor: EventActor, eventId: unknown): Promise<void> {
      if (!canManageEvents(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja pode remover eventos.");
      }
      const id = typeof eventId === "string" ? eventId.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("validation_error", "Evento inválido.");
      if (!(await repo.softDeleteEvent(actor.companyId, id))) {
        throw new AppError("not_found", "Evento não encontrado.");
      }
    },
  };
}

export type ChurchEventsService = ReturnType<typeof createChurchEventsService>;
