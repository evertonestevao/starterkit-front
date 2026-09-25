import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import { CARGO_LABEL, CHURCH_CARGOS, isCargoUnico, sortLeaders } from "@/lib/churchLeaders";
import type { ChurchCargo, ChurchLeader, ChurchWithLeaders, LeaderInviteRole } from "@/types/churchLeaders";
import type { RoleCode } from "@/types/database";

/**
 * Cargos da igreja: quem é o pastor, o presbítero, o secretário.
 *
 * Cargo NÃO é permissão. Quem administra o sistema continua sendo o papel na
 * empresa; aqui só se registra quem ocupa cada função, para a igreja superior
 * ver "Subsede Zona Norte — Pastor: João" na rede dela. A pessoa pode nem ter
 * conta: se o registro tem e-mail, a igreja pode convidá-la para o sistema
 * (convite normal, com o papel escolhido) sem digitar tudo de novo.
 *
 * Nome, e-mail e telefone são dado pessoal: só owner/admin leem (a RLS repete
 * a regra), e nada disto vai para página pública.
 */

export interface ChurchLeadersRepository {
  listCompanyChurches(companyId: string): Promise<Array<{ id: string; name: string }>>;
  /** Líderes ativos das igrejas (a RLS deixa passar só o que a pessoa administra). */
  listLeaders(churchIds: string[]): Promise<ChurchLeader[]>;
  /** Nome do Pastor de cada igreja que tem um, por id da igreja. */
  listPastors(churchIds: string[]): Promise<Record<string, string>>;
  create(input: {
    churchId: string;
    cargo: ChurchCargo;
    nome: string;
    email: string | null;
    telefone: string | null;
  }): Promise<ChurchLeader>;
  markInvited(input: { leaderId: string; churchId: string }): Promise<void>;
  /** Encerra o cargo (fica no histórico). false = não achou na empresa. */
  remove(input: { leaderId: string; churchId: string }): Promise<boolean>;
}

/** Porta para o convite de membro (inviteService), que já limita o ritmo e avisa por e-mail. */
export type LeaderInviter = (input: {
  companyId: string;
  email: string;
  role: LeaderInviteRole;
  invitedBy: string;
}) => Promise<void>;

export interface LeadersAudit {
  record(input: {
    companyId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface ChurchLeadersActor {
  companyId: string;
  role: RoleCode;
  userId: string;
}

const QUEM_GERENCIA: RoleCode[] = ["owner", "admin"];

export function canManageLeaders(role: RoleCode): boolean {
  return QUEM_GERENCIA.includes(role);
}

/** Campo de formulário vazio vira ausente. */
const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const addSchema = z
  .object({
    churchId: z.uuid("Igreja inválida"),
    cargo: z.enum(CHURCH_CARGOS.map((c) => c.slug) as [ChurchCargo, ...ChurchCargo[]], "Escolha o cargo"),
    nome: z.string().trim().min(2, "Informe o nome").max(120, "Nome longo demais"),
    email: opcional(z.email("E-mail inválido").max(254, "E-mail longo demais")),
    telefone: opcional(z.string().trim().min(8, "Telefone inválido").max(20, "Telefone inválido")),
    // Sem valor = só registrar, sem dar acesso ao sistema.
    convidarComo: opcional(z.enum(["admin", "member"], "Escolha o papel do convite")),
  })
  .refine((v) => !v.convidarComo || Boolean(v.email), {
    message: "Para convidar, informe o e-mail da pessoa",
    path: ["email"],
  });

const removeSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  leaderId: z.uuid("Registro inválido"),
});

const pastorsSchema = z.array(z.uuid()).max(1000);

export function createChurchLeadersService(deps: {
  repo: ChurchLeadersRepository;
  inviter?: LeaderInviter;
  audit?: LeadersAudit;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;

  function exigePermissao(actor: ChurchLeadersActor) {
    if (!canManageLeaders(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode cuidar dos cargos.");
    }
  }

  async function auditar(actor: ChurchLeadersActor, action: string, entityId: string, metadata: Record<string, unknown>) {
    await deps.audit
      ?.record({
        companyId: actor.companyId,
        userId: actor.userId,
        action,
        entityType: "church_leader",
        entityId,
        metadata,
      })
      .catch((err) => log.error("[cargos] falha ao registrar auditoria", err));
  }

  return {
    /** As igrejas da empresa com quem ocupa cada cargo (Pastor primeiro). */
    async listByCompany(actor: ChurchLeadersActor): Promise<ChurchWithLeaders[]> {
      exigePermissao(actor);
      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      if (igrejas.length === 0) return [];
      const lideres = await deps.repo.listLeaders(igrejas.map((i) => i.id));
      return igrejas.map((igreja) => ({
        ...igreja,
        leaders: sortLeaders(lideres.filter((l) => l.churchId === igreja.id)),
      }));
    },

    /**
     * O Pastor de cada igreja pedida, para a lista de igrejas ligadas. A RLS
     * só devolve as igrejas que a pessoa administra ou que estão abaixo delas.
     */
    async pastorsOf(actor: ChurchLeadersActor, churchIds: string[]): Promise<Record<string, string>> {
      exigePermissao(actor);
      const parsed = pastorsSchema.safeParse(churchIds);
      if (!parsed.success) throw new AppError("validation_error", "Igrejas inválidas");
      if (parsed.data.length === 0) return {};
      return deps.repo.listPastors(parsed.data);
    },

    /**
     * Registra quem ocupa um cargo e, se pedido, já convida a pessoa para o
     * sistema. O registro vale mesmo que o convite falhe — nesse caso a
     * mensagem diz isso, e o convite pode ser refeito pela tela de Equipe.
     */
    async addLeader(actor: ChurchLeadersActor, input: unknown): Promise<{ invited: boolean }> {
      exigePermissao(actor);
      const parsed = addSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, cargo, nome, email, telefone, convidarComo } = parsed.data;

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((i) => i.id === churchId)) throw new AppError("not_found", "Igreja não encontrada.");

      if (isCargoUnico(cargo)) {
        const atuais = await deps.repo.listLeaders([churchId]);
        if (atuais.some((l) => l.cargo === cargo)) {
          throw new AppError(
            "conflict",
            `Esta igreja já tem ${CARGO_LABEL[cargo]} registrado. Remova o atual antes de registrar outro.`,
          );
        }
      }

      const lider = await deps.repo.create({
        churchId,
        cargo,
        nome,
        email: email?.toLowerCase() ?? null,
        telefone: telefone ?? null,
      });
      await auditar(actor, "church.leader.added", lider.id, { cargo, convidado: Boolean(convidarComo) });

      if (!convidarComo || !email) return { invited: false };
      if (!deps.inviter) {
        throw new AppError("internal_error", "Cargo registrado, mas o convite não pôde ser enviado agora.");
      }

      try {
        await deps.inviter({ companyId: actor.companyId, email: email.toLowerCase(), role: convidarComo, invitedBy: actor.userId });
      } catch (err) {
        log.error("[cargos] falha ao enviar o convite", err);
        // Limite de convites é uma resposta útil; qualquer outra coisa vira texto genérico.
        const limite = err instanceof AppError && err.code === "rate_limited";
        throw new AppError(
          limite ? "rate_limited" : "email_error",
          limite
            ? "Cargo registrado, mas o limite de convites foi atingido. Convide pela tela de Equipe mais tarde."
            : "Cargo registrado, mas o convite não foi enviado. Convide pela tela de Equipe.",
          err,
        );
      }

      await deps.repo
        .markInvited({ leaderId: lider.id, churchId })
        .catch((err) => log.error("[cargos] falha ao marcar o convite", err));
      return { invited: true };
    },

    /** Tira a pessoa do cargo. O registro fica no histórico; o acesso ao sistema não muda. */
    async removeLeader(actor: ChurchLeadersActor, input: unknown): Promise<void> {
      exigePermissao(actor);
      const parsed = removeSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, leaderId } = parsed.data;

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((i) => i.id === churchId)) throw new AppError("not_found", "Igreja não encontrada.");

      const removido = await deps.repo.remove({ leaderId, churchId });
      if (!removido) throw new AppError("not_found", "Registro não encontrado.");
      await auditar(actor, "church.leader.removed", leaderId, {});
    },
  };
}

export type ChurchLeadersService = ReturnType<typeof createChurchLeadersService>;
