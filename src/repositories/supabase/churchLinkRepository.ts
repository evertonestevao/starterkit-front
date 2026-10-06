import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { formatChurchName } from "@/lib/churchName";
import type { ChurchLinkRepository } from "@/services/churchLinkService";
import type {
  ChurchLinkChurch,
  ChurchLinkInvite,
  ChurchLinkInviteStatus,
  ChurchLinkNode,
  ChurchLinkNotice,
  ChurchLinkNoticeKind,
  ChurchLinkRequest,
  ChurchLinkRequestStatus,
  ChurchLinkTipo,
} from "@/types/churchLinks";
import type { ChurchTipo } from "@/types/database";

const CHURCH_COLUMNS = "id, name, sobrenome, tipo, public_code, parent_id";

interface ChurchRow {
  id: string;
  name: string;
  sobrenome: string | null;
  tipo: ChurchTipo;
  public_code: string;
  parent_id: string | null;
}

function toNode(row: ChurchRow): ChurchLinkNode {
  return { id: row.id, name: row.name, sobrenome: row.sobrenome, tipo: row.tipo, publicCode: row.public_code };
}

/**
 * As funções do banco escrevem as recusas de regra ("Só uma igreja que não tem
 * superior pode ter subsedes.") para a pessoa ler — código P0001. Tudo o mais
 * vira mensagem genérica, sem vazar detalhe interno.
 */
function toAppError(error: PostgrestError, fallback: string): AppError {
  if (error.code === "P0001") return new AppError("validation_error", error.message, error);
  if (error.code === "P0002") return new AppError("not_found", error.message, error);
  if (error.code === "42501") {
    return new AppError("forbidden", "Você não tem permissão para fazer isso com esta igreja.", error);
  }
  return new AppError("internal_error", fallback, error);
}

/** `expirado` e `esgotado` são calculados na leitura, como o banco faz. */
function inviteStatus(
  status: string,
  expiresAt: string | null,
  uses: number,
  maxUses: number | null,
  now = Date.now(),
): ChurchLinkInviteStatus {
  if (status === "revogado") return "revogado";
  if (expiresAt !== null && new Date(expiresAt).getTime() <= now) return "expirado";
  if (maxUses !== null && uses >= maxUses) return "esgotado";
  return "ativo";
}

const REQUEST_SELECT =
  "id, status, tipo_solicitado, tipo_final, motivo_recusa, requested_at, decided_at, parent_church_id, child_church_id, solicitante_nome";

interface RequestRow {
  id: string;
  status: ChurchLinkRequestStatus;
  tipo_solicitado: ChurchLinkTipo;
  tipo_final: ChurchLinkTipo | null;
  motivo_recusa: string | null;
  requested_at: string;
  decided_at: string | null;
  parent_church_id: string;
  child_church_id: string;
  solicitante_nome: string | null;
}

/** Nome, endereço e chave da página de uma igreja, vindos de `igrejas_resumo`. */
interface ResumoRow {
  id: string;
  name: string;
  sobrenome: string | null;
  address: string | null;
  public_code: string;
}

function toRequest(row: RequestRow, igrejas: Map<string, ResumoRow>): ChurchLinkRequest {
  const parent = igrejas.get(row.parent_church_id) ?? null;
  const child = igrejas.get(row.child_church_id) ?? null;
  return {
    id: row.id,
    status: row.status,
    tipoSolicitado: row.tipo_solicitado,
    tipoFinal: row.tipo_final,
    motivoRecusa: row.motivo_recusa,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    parentChurchId: row.parent_church_id,
    childChurchId: row.child_church_id,
    parentName: parent ? formatChurchName(parent.name, parent.sobrenome) : "Igreja",
    childName: child ? formatChurchName(child.name, child.sobrenome) : "Igreja",
    childAddress: child?.address ?? null,
    childPublicCode: child?.public_code ?? null,
    solicitanteNome: row.solicitante_nome,
  };
}

/**
 * Vínculo entre igrejas. A árvore só muda pelas funções (security definer)
 * de `church_links`: `parent_id` e `tipo` não têm GRANT de escrita para o
 * client. As leituras usam o client do usuário; a única exceção é a lista de
 * e-mails de admins de OUTRA empresa, que exige `adminClient` e só é chamada
 * com o id devolvido pelo próprio banco.
 */
export function createSupabaseChurchLinkRepository(
  client: SupabaseClient,
  adminClient?: SupabaseClient,
): ChurchLinkRepository {
  /**
   * Pedidos com o nome das duas igrejas. A outra parte não é da rede de quem
   * lê (ainda está pedindo para entrar), então não vem da tabela: vem de
   * `igrejas_resumo`, que libera nome e endereço entre as partes de um pedido.
   */
  async function comIgrejas(rows: RequestRow[]): Promise<ChurchLinkRequest[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.parent_church_id, r.child_church_id]))];
    const igrejas = new Map<string, ResumoRow>();
    if (ids.length > 0) {
      const { data, error } = await client.rpc("igrejas_resumo", { p_ids: ids });
      if (error) throw new AppError("internal_error", "Falha ao carregar os pedidos", error);
      for (const i of (data ?? []) as ResumoRow[]) igrejas.set(i.id, i);
    }
    return rows.map((r) => toRequest(r, igrejas));
  }

  return {
    async listCompanyChurches(companyId): Promise<ChurchLinkChurch[]> {
      const { data, error } = await client
        .from("churches")
        .select(CHURCH_COLUMNS)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return ((data ?? []) as ChurchRow[]).map((row) => ({ ...toNode(row), parentId: row.parent_id }));
    },

    async getNeighbors(churchId) {
      const { data: self, error } = await client
        .from("churches")
        .select("parent_id")
        .eq("id", churchId)
        .maybeSingle<{ parent_id: string | null }>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a árvore", error);

      const [parent, children] = await Promise.all([
        // A igreja de cima não é lida na tabela (a de baixo não enxerga a de
        // cima): nome e posição vêm do resumo, que só tem dados públicos.
        self?.parent_id
          ? client
              .rpc("igrejas_resumo", { p_ids: [self.parent_id] })
              .then(({ data, error: erroMae }) => ({ data: ((data ?? []) as ChurchRow[])[0] ?? null, error: erroMae }))
          : Promise.resolve({ data: null, error: null }),
        client.from("churches").select(CHURCH_COLUMNS).eq("parent_id", churchId).is("deleted_at", null).order("name"),
      ]);
      if (parent.error || children.error) {
        throw new AppError("internal_error", "Falha ao carregar a árvore", parent.error ?? children.error);
      }
      const filhas = ((children.data ?? []) as ChurchRow[]).map(toNode);

      // As congregações de cada subsede, para a contagem e a lista da tela. Em blocos, para o
      // filtro `in` não virar uma URL enorme quando a rede tem centenas de subsedes.
      const congregacoesPorIgreja: Record<string, ChurchLinkNode[]> = {};
      const subsedes = filhas.filter((f) => f.tipo === "subsede").map((f) => f.id);
      const blocos: string[][] = [];
      for (let i = 0; i < subsedes.length; i += 100) blocos.push(subsedes.slice(i, i + 100));
      const netas = await Promise.all(
        blocos.map((ids) =>
          client
            .from("churches")
            .select(CHURCH_COLUMNS)
            .in("parent_id", ids)
            .is("deleted_at", null)
            .order("name")
            .limit(5000),
        ),
      );
      for (const { data, error: erroNetas } of netas) {
        if (erroNetas) throw new AppError("internal_error", "Falha ao carregar as congregações", erroNetas);
        for (const row of (data ?? []) as unknown as Array<ChurchRow & { parent_id: string }>) {
          (congregacoesPorIgreja[row.parent_id] ??= []).push(toNode(row));
        }
      }

      return {
        parent: parent.data ? toNode(parent.data as ChurchRow) : null,
        children: filhas,
        congregacoesPorIgreja,
      };
    },

    async listInvites(churchId): Promise<ChurchLinkInvite[]> {
      const { data, error } = await client
        .from("church_link_invites")
        .select("id, tipo_subordinada, status, expires_at, max_uses, created_at")
        .eq("church_id", churchId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new AppError("internal_error", "Falha ao carregar os links", error);
      const links = (data ?? []) as Array<{
        id: string;
        tipo_subordinada: ChurchLinkTipo;
        status: string;
        expires_at: string | null;
        max_uses: number | null;
        created_at: string;
      }>;
      if (links.length === 0) return [];

      // Quantos pedidos cada link já gerou (a superior lê os pedidos dela pela RLS).
      const { data: usos, error: erroUsos } = await client
        .from("church_link_requests")
        .select("invite_id")
        .in("invite_id", links.map((l) => l.id));
      if (erroUsos) throw new AppError("internal_error", "Falha ao contar os pedidos", erroUsos);
      const contagem = new Map<string, number>();
      for (const { invite_id } of (usos ?? []) as Array<{ invite_id: string }>) {
        contagem.set(invite_id, (contagem.get(invite_id) ?? 0) + 1);
      }

      return links.map((link) => {
        const uses = contagem.get(link.id) ?? 0;
        return {
          id: link.id,
          tipoSubordinada: link.tipo_subordinada,
          status: inviteStatus(link.status, link.expires_at, uses, link.max_uses),
          expiresAt: link.expires_at,
          maxUses: link.max_uses,
          uses,
          createdAt: link.created_at,
        };
      });
    },

    async listRequests(churchId): Promise<ChurchLinkRequest[]> {
      const { data, error } = await client
        .from("church_link_requests")
        .select(REQUEST_SELECT)
        .or(`parent_church_id.eq.${churchId},child_church_id.eq.${churchId}`)
        .order("requested_at", { ascending: false })
        .limit(30);
      if (error) throw new AppError("internal_error", "Falha ao carregar os pedidos", error);
      return comIgrejas((data ?? []) as unknown as RequestRow[]);
    },

    async listRequestsByInvite(inviteId): Promise<ChurchLinkRequest[]> {
      const { data, error } = await client
        .from("church_link_requests")
        .select(REQUEST_SELECT)
        .eq("invite_id", inviteId)
        .order("requested_at", { ascending: false });
      if (error) throw new AppError("internal_error", "Falha ao carregar os pedidos", error);
      return comIgrejas((data ?? []) as unknown as RequestRow[]);
    },

    async createInvite({ churchId, tipo, tokenHash, expiresAt, maxUses }) {
      const { data, error } = await client.rpc("create_church_link_invite", {
        p_church_id: churchId,
        p_tipo: tipo,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_max_uses: maxUses,
      });
      if (error) throw toAppError(error, "Não foi possível gerar o link.");
      return data as string;
    },

    async revokeInvite(inviteId) {
      const { data, error } = await client.rpc("revoke_church_link_invite", { p_invite_id: inviteId });
      if (error) throw toAppError(error, "Não foi possível cancelar o link.");
      return Boolean(data);
    },

    async getInviteByToken(tokenHash) {
      const { data, error } = await client.rpc("get_church_link_invite", { p_token_hash: tokenHash });
      if (error) throw toAppError(error, "Não foi possível abrir o link.");
      const row = ((data ?? []) as Array<{
        invite_id: string;
        tipo_subordinada: ChurchLinkTipo;
        status: ChurchLinkInviteStatus;
        expires_at: string | null;
        is_mine: boolean;
        church_id: string;
        church_name: string;
        church_sobrenome: string | null;
        church_address: string | null;
        church_tipo: ChurchTipo;
        church_public_code: string;
      }>)[0];
      if (!row) return null;
      return {
        inviteId: row.invite_id,
        tipoSubordinada: row.tipo_subordinada,
        status: row.status,
        expiresAt: row.expires_at,
        isMine: row.is_mine,
        church: {
          id: row.church_id,
          name: row.church_name,
          sobrenome: row.church_sobrenome,
          address: row.church_address,
          tipo: row.church_tipo,
          publicCode: row.church_public_code,
        },
      };
    },

    async requestLink({ tokenHash, childChurchId }) {
      const { data, error } = await client.rpc("request_church_link", {
        p_token_hash: tokenHash,
        p_child_church_id: childChurchId,
      });
      if (error) throw toAppError(error, "Não foi possível enviar o pedido.");
      const row = ((data ?? []) as Array<{
        parent_company_id: string;
        parent_church_name: string;
        child_church_name: string;
        tipo_solicitado: ChurchLinkTipo;
      }>)[0];
      if (!row) throw new AppError("internal_error", "Não foi possível enviar o pedido.");
      return {
        parentCompanyId: row.parent_company_id,
        parentChurchName: row.parent_church_name,
        childChurchName: row.child_church_name,
        tipo: row.tipo_solicitado,
      };
    },

    async cancelRequest(requestId) {
      const { data, error } = await client.rpc("cancel_church_link_request", { p_request_id: requestId });
      if (error) throw toAppError(error, "Não foi possível cancelar o pedido.");
      return Boolean(data);
    },

    async decideRequest({ requestId, approve, tipo, motivo }) {
      const { data, error } = await client.rpc("decide_church_link_request", {
        p_request_id: requestId,
        p_aprovar: approve,
        p_tipo: tipo,
        p_motivo: motivo,
      });
      if (error) throw toAppError(error, "Não foi possível registrar a decisão.");
      const row = ((data ?? []) as Array<{
        child_company_id: string;
        parent_church_name: string;
        child_church_name: string;
        tipo: ChurchLinkTipo;
        aprovado: boolean;
      }>)[0];
      if (!row) throw new AppError("internal_error", "Não foi possível registrar a decisão.");
      return {
        childCompanyId: row.child_company_id,
        parentChurchName: row.parent_church_name,
        childChurchName: row.child_church_name,
        tipo: row.tipo,
        approved: row.aprovado,
      };
    },

    async changePosition({ childId, tipo, newParentId }) {
      const { data, error } = await client.rpc("change_church_position", {
        p_child_id: childId,
        p_tipo: tipo,
        p_new_parent_id: newParentId,
      });
      if (error) throw toAppError(error, "Não foi possível mudar a posição.");
      const row = ((data ?? []) as Array<{
        child_company_id: string | null;
        child_church_name: string;
        parent_church_name: string;
        tipo: ChurchLinkTipo;
      }>)[0];
      if (!row) throw new AppError("internal_error", "Não foi possível mudar a posição.");
      return {
        childCompanyId: row.child_company_id,
        childChurchName: row.child_church_name,
        parentChurchName: row.parent_church_name,
        tipo: row.tipo,
      };
    },

    async endLink(churchId) {
      const { data, error } = await client.rpc("end_church_link", { p_church_id: churchId });
      if (error) throw toAppError(error, "Não foi possível desfazer o vínculo.");
      const row = ((data ?? []) as Array<{
        other_company_id: string | null;
        other_church_name: string;
        own_church_name: string;
      }>)[0];
      if (!row) throw new AppError("internal_error", "Não foi possível desfazer o vínculo.");
      return {
        otherCompanyId: row.other_company_id,
        otherChurchName: row.other_church_name,
        ownChurchName: row.own_church_name,
      };
    },

    async listNotices(companyId): Promise<ChurchLinkNotice[]> {
      const { data, error } = await client
        .from("church_link_notices")
        .select("id, kind, outra_igreja_nome, detalhe, created_at")
        .eq("company_id", companyId)
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw new AppError("internal_error", "Falha ao carregar os avisos", error);
      return ((data ?? []) as Array<{
        id: string;
        kind: ChurchLinkNoticeKind;
        outra_igreja_nome: string;
        detalhe: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        kind: row.kind,
        outraIgrejaNome: row.outra_igreja_nome,
        detalhe: row.detalhe,
        createdAt: row.created_at,
      }));
    },

    async dismissNotice(noticeId) {
      const { data, error } = await client.rpc("dismiss_church_link_notice", { p_notice_id: noticeId });
      if (error) throw toAppError(error, "Não foi possível dispensar o aviso.");
      return Boolean(data);
    },

    async listAdminEmails(companyId) {
      if (!adminClient) return [];
      const { data: members, error } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .in("role", ["owner", "admin"])
        .is("deleted_at", null);
      if (error) throw new AppError("internal_error", "Falha ao listar quem administra a igreja", error);

      const emails: string[] = [];
      for (const { user_id } of (members ?? []) as Array<{ user_id: string }>) {
        const { data } = await adminClient.auth.admin.getUserById(user_id);
        if (data.user?.email) emails.push(data.user.email);
      }
      return emails;
    },
  };
}
