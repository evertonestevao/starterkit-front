import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import {
  CHURCH_LINK_MAX_USES_LIMIT,
  churchLinkPath,
  inviteOptions,
  linkExpiration,
} from "@/lib/churchLinks";
import type { RateLimiter } from "@/server/rateLimit";
import type {
  ChurchLinkChurch,
  ChurchLinkDecision,
  ChurchLinkEnded,
  ChurchLinkInvite,
  ChurchLinkMoved,
  ChurchLinkNode,
  ChurchLinkNotice,
  ChurchLinkPreview,
  ChurchLinkRequest,
  ChurchLinkRequested,
  ChurchLinkTipo,
} from "@/types/churchLinks";
import type { RoleCode } from "@/types/database";

/**
 * Vínculo entre igrejas. A igreja SUPERIOR gera um link e o manda aos pastores
 * de baixo; o link não liga nada — quem o abre lê o que o vínculo significa e,
 * se quiser, gera um PEDIDO, que a superior aprova (podendo ajustar a posição)
 * ou recusa. Depois de vinculadas, a superior pode mover a igreja de posição
 * dentro da árvore dela, e qualquer das duas pontas pode desfazer o vínculo.
 *
 * A árvore (parent_id/tipo) só muda pelas funções do banco, que conferem quem
 * é o usuário e a empresa dele. Este service valida o formato, limita a
 * criação de links e avisa a outra ponta por e-mail — o aviso é do que
 * aconteceu, e nunca desfaz o que já foi feito se falhar.
 */

export interface ChurchLinkRepository {
  listCompanyChurches(companyId: string): Promise<ChurchLinkChurch[]>;
  /**
   * A igreja-mãe, as ligadas diretamente e, de cada subsede ligada, as congregações dela
   * (por id da subsede). Assim a tela mostra quantas congregações cada subsede tem.
   */
  getNeighbors(churchId: string): Promise<{
    parent: ChurchLinkNode | null;
    children: ChurchLinkNode[];
    congregacoesPorIgreja: Record<string, ChurchLinkNode[]>;
  }>;
  /** Links gerados por esta igreja, com quantos pedidos cada um já gerou. */
  listInvites(churchId: string): Promise<ChurchLinkInvite[]>;
  /** Pedidos em que esta igreja é a superior OU a de baixo, do mais recente ao mais antigo. */
  listRequests(churchId: string): Promise<ChurchLinkRequest[]>;
  /** Pedidos gerados por um link que a pessoa (ou a superior) pode ler. */
  listRequestsByInvite(inviteId: string): Promise<ChurchLinkRequest[]>;
  createInvite(input: {
    churchId: string;
    tipo: ChurchLinkTipo;
    tokenHash: string;
    expiresAt: string | null;
    maxUses: number | null;
  }): Promise<string>;
  revokeInvite(inviteId: string): Promise<boolean>;
  getInviteByToken(tokenHash: string): Promise<ChurchLinkPreview | null>;
  requestLink(input: { tokenHash: string; childChurchId: string }): Promise<ChurchLinkRequested>;
  cancelRequest(requestId: string): Promise<boolean>;
  decideRequest(input: {
    requestId: string;
    approve: boolean;
    tipo: ChurchLinkTipo | null;
    motivo: string | null;
  }): Promise<ChurchLinkDecision>;
  changePosition(input: {
    childId: string;
    tipo: ChurchLinkTipo;
    newParentId: string | null;
  }): Promise<ChurchLinkMoved>;
  endLink(churchId: string): Promise<ChurchLinkEnded>;
  listNotices(companyId: string): Promise<ChurchLinkNotice[]>;
  dismissNotice(noticeId: string): Promise<boolean>;
  /** Owners e admins da empresa (service_role: quem age não os enxerga). */
  listAdminEmails(companyId: string): Promise<string[]>;
}

export interface ChurchLinkNotifier {
  requested(input: {
    to: string[];
    parentName: string;
    childName: string;
    tipo: ChurchLinkTipo;
  }): Promise<void>;
  decided(input: {
    to: string[];
    approved: boolean;
    parentName: string;
    childName: string;
    tipo: ChurchLinkTipo;
    motivo: string | null;
  }): Promise<void>;
  moved(input: { to: string[]; parentName: string; childName: string; tipo: ChurchLinkTipo }): Promise<void>;
  ended(input: { to: string[]; endedByName: string; otherName: string }): Promise<void>;
}

export interface ChurchLinkActor {
  companyId: string;
  role: RoleCode;
  userId: string;
}

interface Deps {
  repo: ChurchLinkRepository;
  rateLimiter: RateLimiter;
  notifier?: ChurchLinkNotifier;
  makeToken: () => string;
  hashToken: (token: string) => string;
  appUrl: string;
  now?: () => Date;
  log?: { error(message: string, meta?: unknown): void };
}

const QUEM_GERENCIA: RoleCode[] = ["owner", "admin"];

export function canManageChurchLinks(role: RoleCode): boolean {
  return QUEM_GERENCIA.includes(role);
}

const tipoSchema = z.enum(["subsede", "congregacao"], { error: "Escolha a função da igreja convidada" });

const createSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  tipo: tipoSchema,
  // Sem padrão: quem gera o link escolhe a validade e o limite. null = sem validade / sem limite.
  validityDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.null()], {
    error: "Escolha a validade do link",
  }),
  maxUses: z
    .number({ error: "Escolha quantos pedidos o link aceita" })
    .int("Número de pedidos inválido")
    .min(1, "O link precisa aceitar pelo menos 1 pedido")
    .max(CHURCH_LINK_MAX_USES_LIMIT, `O limite é de ${CHURCH_LINK_MAX_USES_LIMIT} pedidos por link`)
    .nullable(),
});

const requestSchema = z.object({
  token: z.string().trim().min(20, "Link inválido").max(200, "Link inválido"),
  churchId: z.uuid("Escolha a igreja que vai pedir o vínculo"),
});

const decideSchema = z.object({
  requestId: z.uuid("Pedido inválido"),
  approve: z.boolean(),
  tipo: tipoSchema.optional(),
  motivo: z.string().trim().max(500, "Motivo muito longo").optional(),
});

const moveSchema = z.object({
  childId: z.uuid("Igreja inválida"),
  tipo: tipoSchema,
  newParentId: z.uuid("Igreja superior inválida").nullable(),
});

/** Quem recebe o e-mail nunca deve depender de o envio dar certo. */
async function bestEffort(log: NonNullable<Deps["log"]>, what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    log.error(`[church-link] falha ao ${what}`, err);
  }
}

export function createChurchLinkService({
  repo,
  rateLimiter,
  notifier,
  makeToken,
  hashToken,
  appUrl,
  now = () => new Date(),
  log = console,
}: Deps) {
  const base = appUrl.replace(/\/+$/, "");

  function exigePermissao(actor: ChurchLinkActor) {
    if (!canManageChurchLinks(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode cuidar dos vínculos.");
    }
  }

  async function igrejaDaEmpresa(actor: ChurchLinkActor, churchId: string): Promise<ChurchLinkChurch> {
    const igrejas = await repo.listCompanyChurches(actor.companyId);
    const igreja = igrejas.find((c) => c.id === churchId);
    if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");
    return igreja;
  }

  async function avisar(companyId: string | null, what: string, enviar: (to: string[]) => Promise<void>) {
    if (!notifier || !companyId) return;
    await bestEffort(log, what, async () => enviar(await repo.listAdminEmails(companyId)));
  }

  return {
    /** Igrejas da empresa ativa, para escolher com qual delas se trabalha. */
    async listChurches(actor: ChurchLinkActor): Promise<ChurchLinkChurch[]> {
      exigePermissao(actor);
      return repo.listCompanyChurches(actor.companyId);
    },

    /**
     * A posição da igreja na árvore e tudo o que se faz a partir dela: links
     * gerados, pedidos a decidir (como superior), o próprio pedido (como igreja
     * de baixo) e o histórico.
     */
    async overview(actor: ChurchLinkActor, churchId: string) {
      exigePermissao(actor);
      const church = await igrejaDaEmpresa(actor, churchId);
      const [neighbors, invites, requests] = await Promise.all([
        repo.getNeighbors(church.id),
        repo.listInvites(church.id),
        repo.listRequests(church.id),
      ]);
      return {
        church,
        parent: neighbors.parent,
        children: neighbors.children,
        congregacoesPorIgreja: neighbors.congregacoesPorIgreja,
        invites,
        // Pedidos que esta igreja precisa decidir, e o pedido dela mesma à espera de resposta.
        incomingPending: requests.filter((r) => r.parentChurchId === church.id && r.status === "pendente"),
        myPending: requests.find((r) => r.childChurchId === church.id && r.status === "pendente") ?? null,
        history: requests.filter((r) => r.status !== "pendente"),
        canInvite: inviteOptions(church),
      };
    },

    /** Gera o link. O texto do token existe só aqui, na resposta: o banco guarda o hash. */
    async createInvite(
      actor: ChurchLinkActor,
      input: unknown,
    ): Promise<{ path: string; url: string; expiresAt: string | null }> {
      exigePermissao(actor);
      const parsed = createSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const church = await igrejaDaEmpresa(actor, dados.churchId);
      if (!inviteOptions(church).includes(dados.tipo)) {
        throw new AppError("validation_error", "Esta igreja não pode convidar para essa função.");
      }

      // Por quem gera, dentro da empresa: link novo é o que se abusa.
      await rateLimiter.consume(`church-link:${actor.companyId}:${actor.userId}`);

      const token = makeToken();
      const expiresAt = linkExpiration(dados.validityDays, now());
      await repo.createInvite({
        churchId: church.id,
        tipo: dados.tipo,
        tokenHash: hashToken(token),
        expiresAt,
        maxUses: dados.maxUses,
      });

      const path = churchLinkPath(token);
      return { path, url: `${base}${path}`, expiresAt };
    },

    async revokeInvite(actor: ChurchLinkActor, inviteId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = z.uuid().safeParse(inviteId);
      if (!id.success) throw new AppError("validation_error", "Link inválido.");
      const ok = await repo.revokeInvite(id.data);
      if (!ok) throw new AppError("not_found", "Este link já foi cancelado ou não existe.");
    },

    /** O que a pessoa vê ao abrir o link. null = link que não existe. */
    async previewInvite(token: string): Promise<ChurchLinkPreview | null> {
      const limpo = typeof token === "string" ? token.trim() : "";
      if (limpo.length < 20 || limpo.length > 200) return null;
      return repo.getInviteByToken(hashToken(limpo));
    },

    /** Os pedidos que as igrejas da empresa ativa já fizeram a partir de um link. */
    async myRequestsForInvite(actor: ChurchLinkActor, inviteId: string): Promise<ChurchLinkRequest[]> {
      exigePermissao(actor);
      const minhas = new Set((await repo.listCompanyChurches(actor.companyId)).map((c) => c.id));
      return (await repo.listRequestsByInvite(inviteId)).filter((r) => minhas.has(r.childChurchId));
    },

    /** A igreja de baixo pede o vínculo. Nada muda na árvore: a superior é avisada e decide. */
    async requestLink(actor: ChurchLinkActor, input: unknown): Promise<ChurchLinkRequested> {
      exigePermissao(actor);
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      // A igreja que pede tem que ser da empresa ativa: o banco confere de
      // novo, mas aqui a mensagem é clara.
      await igrejaDaEmpresa(actor, dados.churchId);

      const resultado = await repo.requestLink({ tokenHash: hashToken(dados.token), childChurchId: dados.churchId });

      await avisar(resultado.parentCompanyId, "avisar a superior do pedido", (to) =>
        notifier!.requested({
          to,
          parentName: resultado.parentChurchName,
          childName: resultado.childChurchName,
          tipo: resultado.tipo,
        }),
      );
      return resultado;
    },

    async cancelRequest(actor: ChurchLinkActor, requestId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = z.uuid().safeParse(requestId);
      if (!id.success) throw new AppError("validation_error", "Pedido inválido.");
      const ok = await repo.cancelRequest(id.data);
      if (!ok) throw new AppError("not_found", "Este pedido já foi respondido ou não existe.");
    },

    /** A superior aprova (podendo ajustar a posição) ou recusa. Só aprovar muda a árvore. */
    async decideRequest(actor: ChurchLinkActor, input: unknown): Promise<ChurchLinkDecision> {
      exigePermissao(actor);
      const parsed = decideSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const resultado = await repo.decideRequest({
        requestId: dados.requestId,
        approve: dados.approve,
        tipo: dados.approve ? (dados.tipo ?? null) : null,
        motivo: dados.approve ? null : dados.motivo || null,
      });

      await avisar(resultado.childCompanyId, "avisar quem pediu da decisão", (to) =>
        notifier!.decided({
          to,
          approved: resultado.approved,
          parentName: resultado.parentChurchName,
          childName: resultado.childChurchName,
          tipo: resultado.tipo,
          motivo: dados.approve ? null : dados.motivo || null,
        }),
      );
      return resultado;
    },

    /** A superior muda a posição de uma igreja da árvore dela; a igreja movida é avisada. */
    async changePosition(actor: ChurchLinkActor, input: unknown): Promise<ChurchLinkMoved> {
      exigePermissao(actor);
      const parsed = moveSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);

      const resultado = await repo.changePosition(parsed.data);

      await avisar(resultado.childCompanyId, "avisar a igreja movida", (to) =>
        notifier!.moved({
          to,
          parentName: resultado.parentChurchName,
          childName: resultado.childChurchName,
          tipo: resultado.tipo,
        }),
      );
      return resultado;
    },

    /** Desfaz o vínculo (qualquer das duas pontas) e avisa a outra. */
    async endLink(actor: ChurchLinkActor, churchId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = z.uuid().safeParse(churchId);
      if (!id.success) throw new AppError("validation_error", "Igreja inválida.");

      const resultado = await repo.endLink(id.data);

      await avisar(resultado.otherCompanyId, "avisar sobre o vínculo desfeito", (to) =>
        notifier!.ended({ to, endedByName: resultado.ownChurchName, otherName: resultado.otherChurchName }),
      );
    },

    async listNotices(actor: ChurchLinkActor): Promise<ChurchLinkNotice[]> {
      if (!canManageChurchLinks(actor.role)) return [];
      return repo.listNotices(actor.companyId);
    },

    async dismissNotice(actor: ChurchLinkActor, noticeId: unknown): Promise<void> {
      exigePermissao(actor);
      const id = z.uuid().safeParse(noticeId);
      if (!id.success) throw new AppError("validation_error", "Aviso inválido.");
      await repo.dismissNotice(id.data);
    },
  };
}

export type ChurchLinkService = ReturnType<typeof createChurchLinkService>;
