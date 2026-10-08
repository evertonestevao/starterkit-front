import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ConfirmacaoVenda,
  ConfirmacaoVendaEstado,
  ConfirmacaoVendaRepository,
  VendasPublicasRepository,
  VendasRepository,
} from "@/services/vendasService";
import type { PedidoVenda, StatusPedido, StatusVenda, Venda, VendaPublica } from "@/types/vendas";

const COLS =
  "id, titulo, descricao, preco_cents, pix_chave, pix_titular, pix_confirmado_em, encerra_em, estoque, max_por_pedido, status, created_at";

interface VendaRow {
  id: string;
  titulo: string;
  descricao: string | null;
  preco_cents: number;
  pix_chave: string;
  pix_titular: string;
  pix_confirmado_em: string | null;
  encerra_em: string | null;
  estoque: number | null;
  max_por_pedido: number | null;
  status: StatusVenda;
  created_at: string;
}

const toVenda = (r: VendaRow): Venda => ({
  id: r.id,
  titulo: r.titulo,
  descricao: r.descricao,
  precoCents: r.preco_cents,
  pixChave: r.pix_chave,
  pixTitular: r.pix_titular,
  pixConfirmadoEm: r.pix_confirmado_em,
  encerraEm: r.encerra_em,
  estoque: r.estoque,
  maxPorPedido: r.max_por_pedido,
  status: r.status,
  createdAt: r.created_at,
});

interface PedidoRow {
  id: string;
  venda_id: string;
  nome: string;
  telefone: string;
  quantidade: number;
  preco_unitario_cents: number;
  total_cents: number;
  observacao: string | null;
  status: StatusPedido;
  created_at: string;
}

const toPedido = (r: PedidoRow): PedidoVenda => ({
  id: r.id,
  vendaId: r.venda_id,
  nome: r.nome,
  telefone: r.telefone,
  quantidade: r.quantidade,
  precoUnitarioCents: r.preco_unitario_cents,
  totalCents: r.total_cents,
  observacao: r.observacao,
  status: r.status,
  createdAt: r.created_at,
});

/** Um teto alto para não ler sem fim; uma venda de igreja fica muito abaixo. */
const TETO_PEDIDOS = 5000;

/**
 * Vendas sobre o client do usuário: a RLS só devolve vendas e pedidos da
 * igreja de quem tem o módulo, e toda escrita passa pelas funções do banco,
 * que conferem o acesso de novo. O client com service_role entra só para
 * criar o pedido de confirmação da chave (o usuário não pode escolher o token).
 */
export function createSupabaseVendasRepository(client: SupabaseClient, admin?: SupabaseClient): VendasRepository {
  return {
    async getChurch(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle<{ id: string; name: string }>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      return data;
    },

    async listar(churchId) {
      const { data, error } = await client
        .from("vendas")
        .select(COLS)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new AppError("internal_error", "Falha ao carregar as vendas", error);
      return ((data ?? []) as VendaRow[]).map(toVenda);
    },

    async buscar(churchId, id) {
      const { data, error } = await client
        .from("vendas")
        .select(COLS)
        .eq("church_id", churchId)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<VendaRow>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a venda", error);
      return data ? toVenda(data) : null;
    },

    async salvar(churchId, id, v) {
      const { data, error } = await client.rpc("salvar_venda", {
        p_church_id: churchId,
        p_id: id,
        p: {
          titulo: v.titulo,
          descricao: v.descricao,
          preco_cents: v.precoCents,
          pix_chave: v.pixChave,
          pix_titular: v.pixTitular,
          encerra_em: v.encerraEm ?? "",
          estoque: v.estoque === null ? "" : String(v.estoque),
          max_por_pedido: v.maxPorPedido === null ? "" : String(v.maxPorPedido),
        },
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Venda não encontrada.", error);
        if (error.code === "23514") throw new AppError("validation_error", "Algum campo está fora do permitido.", error);
        throw new AppError("internal_error", "Falha ao salvar a venda", error);
      }
      const row = ((data ?? []) as Array<{ id: string; precisa_confirmar: boolean }>)[0];
      if (!row) throw new AppError("internal_error", "Falha ao salvar a venda");
      return { id: row.id, precisaConfirmar: row.precisa_confirmar };
    },

    async definirStatus(id, status) {
      const { error } = await client.rpc("definir_status_venda", { p_id: id, p_status: status });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Venda não encontrada.", error);
        throw new AppError("internal_error", "Falha ao mudar a situação da venda", error);
      }
    },

    async excluir(id) {
      const { error } = await client.rpc("excluir_venda", { p_id: id });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Venda não encontrada.", error);
        throw new AppError("internal_error", "Falha ao excluir a venda", error);
      }
    },

    async pedidos(vendaIds) {
      const { data, error } = await client
        .from("venda_pedidos")
        .select("id, venda_id, nome, telefone, quantidade, preco_unitario_cents, total_cents, observacao, status, created_at")
        .in("venda_id", vendaIds)
        .order("created_at", { ascending: false })
        .limit(TETO_PEDIDOS);
      if (error) throw new AppError("internal_error", "Falha ao carregar os pedidos", error);
      return ((data ?? []) as PedidoRow[]).map(toPedido);
    },

    async marcarPedido(pedidoId, status) {
      const { error } = await client.rpc("marcar_pedido_venda", { p_pedido_id: pedidoId, p_status: status });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido não encontrado.", error);
        throw new AppError("internal_error", "Falha ao atualizar o pedido", error);
      }
    },

    async criarConfirmacao({ vendaId, tokenHash, solicitadoPor, validadeHoras }) {
      if (!admin) throw new AppError("internal_error", "Confirmação por e-mail indisponível");
      const { data, error } = await admin.rpc("venda_pix_criar_confirmacao", {
        p_venda_id: vendaId,
        p_token_hash: tokenHash,
        p_solicitado_por: solicitadoPor,
        p_validade_horas: validadeHoras,
      });
      if (error) throw new AppError("internal_error", "Falha ao criar o pedido de confirmação", error);
      return ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
    },
  };
}

/**
 * Página pública: a lista sai por uma função que nunca devolve venda com chave
 * não confirmada; o pedido entra só pelo servidor (service_role), depois do
 * limite de envios e da barreira contra robôs.
 */
export function createSupabaseVendasPublicasRepository(
  client: SupabaseClient,
  admin: SupabaseClient,
): VendasPublicasRepository {
  return {
    async listar(churchId) {
      const { data, error } = await client.rpc("vendas_publicas", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar as vendas", error);
      return (
        (data ?? []) as Array<{
          id: string;
          titulo: string;
          descricao: string | null;
          preco_cents: number;
          encerra_em: string | null;
          max_por_pedido: number | null;
          disponivel: number | null;
        }>
      ).map(
        (r): VendaPublica => ({
          id: r.id,
          titulo: r.titulo,
          descricao: r.descricao,
          precoCents: r.preco_cents,
          encerraEm: r.encerra_em,
          maxPorPedido: r.max_por_pedido,
          disponivel: r.disponivel,
        }),
      );
    },

    async criarPedido({ vendaId, nome, telefone, quantidade, observacao }) {
      const { data, error } = await admin.rpc("criar_pedido_venda", {
        p_venda_id: vendaId,
        p_nome: nome,
        p_telefone: telefone,
        p_quantidade: quantidade,
        p_observacao: observacao,
      });
      if (error) {
        // A função escreve as recusas para quem compra ler ("Esgotado", "Só restam 3").
        if (error.code === "P0001") throw new AppError("validation_error", error.message, error);
        if (error.code === "P0002") throw new AppError("not_found", "Venda não encontrada.", error);
        throw new AppError("internal_error", "Não foi possível registrar o pedido.", error);
      }
      const row = (
        (data ?? []) as Array<{
          pedido_id: string;
          total_cents: number;
          pix_chave: string;
          pix_titular: string;
          church_name: string;
          church_address: string | null;
        }>
      )[0];
      if (!row) throw new AppError("internal_error", "Não foi possível registrar o pedido.");
      return {
        pedidoId: row.pedido_id,
        totalCents: row.total_cents,
        pixChave: row.pix_chave,
        pixTitular: row.pix_titular,
        churchName: row.church_name,
        churchAddress: row.church_address,
      };
    },
  };
}

export function createSupabaseConfirmacaoVendaRepository(client: SupabaseClient): ConfirmacaoVendaRepository {
  return {
    async consultar(token) {
      const { data, error } = await client.rpc("venda_pix_confirmacao_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao abrir o link de confirmação", error);
      const row = (
        (data ?? []) as Array<{
          estado: ConfirmacaoVendaEstado;
          church_name: string;
          titulo: string;
          preco_cents: number;
          pix_chave: string | null;
          pix_titular: string | null;
        }>
      )[0];
      if (!row) return null;
      const r: ConfirmacaoVenda = {
        estado: row.estado,
        churchName: row.church_name,
        titulo: row.titulo,
        precoCents: row.preco_cents,
        chave: row.pix_chave,
        titular: row.pix_titular,
      };
      return r;
    },

    async confirmar(token) {
      const { data, error } = await client.rpc("venda_pix_confirmar_por_token", { p_token: token });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Este link de confirmação não vale mais.", error);
        throw new AppError("internal_error", "Falha ao confirmar a chave", error);
      }
      const row = ((data ?? []) as Array<{ church_name: string; titulo: string }>)[0];
      if (!row) throw new AppError("not_found", "Este link de confirmação não vale mais.");
      return { churchName: row.church_name, titulo: row.titulo };
    },
  };
}
