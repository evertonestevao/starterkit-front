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
  "id, titulo, descricao, preco_cents, pix_chave, pix_titular, whatsapp_comprovante, pix_confirmado_em, encerra_em, estoque, max_por_pedido, status, created_at, tem_opcoes, gera_voucher, venda_opcoes(id, nome, preco_cents, ordem, ativo)";

interface VendaRow {
  id: string;
  titulo: string;
  descricao: string | null;
  preco_cents: number;
  pix_chave: string;
  pix_titular: string;
  whatsapp_comprovante: string | null;
  pix_confirmado_em: string | null;
  encerra_em: string | null;
  estoque: number | null;
  max_por_pedido: number | null;
  status: StatusVenda;
  created_at: string;
  tem_opcoes: boolean;
  gera_voucher: boolean;
  venda_opcoes: Array<{ id: string; nome: string; preco_cents: number | null; ordem: number; ativo: boolean }> | null;
}

const toVenda = (r: VendaRow): Venda => ({
  id: r.id,
  titulo: r.titulo,
  descricao: r.descricao,
  precoCents: r.preco_cents,
  pixChave: r.pix_chave,
  pixTitular: r.pix_titular,
  whatsappComprovante: r.whatsapp_comprovante,
  pixConfirmadoEm: r.pix_confirmado_em,
  encerraEm: r.encerra_em,
  estoque: r.estoque,
  maxPorPedido: r.max_por_pedido,
  status: r.status,
  createdAt: r.created_at,
  temOpcoes: r.tem_opcoes,
  geraVoucher: r.gera_voucher,
  // Só as ativas, na ordem da tela; as desativadas continuam nos pedidos antigos.
  opcoes: (r.venda_opcoes ?? [])
    .filter((o) => o.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((o) => ({ id: o.id, nome: o.nome, precoCents: o.preco_cents })),
});

interface PedidoRow {
  id: string;
  venda_id: string;
  nome: string;
  telefone: string;
  quantidade: number;
  total_cents: number;
  observacao: string | null;
  status: StatusPedido;
  created_at: string;
  voucher_codigo: string | null;
  entregue_em: string | null;
  entrega_obs: string | null;
  venda_pedido_itens: Array<{ nome: string; quantidade: number; preco_unitario_cents: number; total_cents: number }> | null;
}

const toPedido = (r: PedidoRow): PedidoVenda => ({
  id: r.id,
  vendaId: r.venda_id,
  nome: r.nome,
  telefone: r.telefone,
  quantidade: r.quantidade,
  totalCents: r.total_cents,
  observacao: r.observacao,
  status: r.status,
  createdAt: r.created_at,
  voucherCodigo: r.voucher_codigo,
  entregueEm: r.entregue_em,
  entregaObs: r.entrega_obs,
  itens: (r.venda_pedido_itens ?? []).map((i) => ({
    nome: i.nome,
    quantidade: i.quantidade,
    precoUnitarioCents: i.preco_unitario_cents,
    totalCents: i.total_cents,
  })),
});

const COLS_PEDIDO =
  "id, venda_id, nome, telefone, quantidade, total_cents, observacao, status, created_at, voucher_codigo, entregue_em, entrega_obs, venda_pedido_itens(nome, quantidade, preco_unitario_cents, total_cents)";

/** Um teto alto para não ler sem fim; uma venda de igreja fica muito abaixo. */
const TETO_PEDIDOS = 5000;

/**
 * Vendas sobre o client do usuário: a RLS só devolve vendas e pedidos da
 * igreja de quem tem o módulo, e toda escrita passa pelas funções do banco,
 * que conferem o acesso de novo. O client com service_role entra só para
 * criar o pedido de confirmação da chave (o usuário não pode escolher o token).
 */
export function createSupabaseVendasRepository(client: SupabaseClient, admin?: SupabaseClient): VendasRepository {
  /** Junta cada pedido com a venda dele (venda excluída some, pela RLS e pelo filtro). */
  async function comVendas(pedidos: PedidoVenda[]) {
    if (pedidos.length === 0) return [];
    const { data, error } = await client
      .from("vendas")
      .select(COLS)
      .in("id", [...new Set(pedidos.map((p) => p.vendaId))])
      .is("deleted_at", null);
    if (error) throw new AppError("internal_error", "Falha ao carregar a venda", error);
    const vendas = new Map(((data ?? []) as VendaRow[]).map((v) => [v.id, toVenda(v)]));
    return pedidos.flatMap((pedido) => {
      const venda = vendas.get(pedido.vendaId);
      return venda ? [{ pedido, venda }] : [];
    });
  }

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
          whatsapp_comprovante: v.whatsappComprovante ?? "",
          encerra_em: v.encerraEm ?? "",
          estoque: v.estoque === null ? "" : String(v.estoque),
          max_por_pedido: v.maxPorPedido === null ? "" : String(v.maxPorPedido),
          tem_opcoes: v.temOpcoes,
          gera_voucher: v.geraVoucher,
          opcoes: v.temOpcoes
            ? v.opcoes.map((o) => ({ id: o.id ?? "", nome: o.nome, preco_cents: o.precoCents === null ? "" : String(o.precoCents) }))
            : [],
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
        .select(COLS_PEDIDO)
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

    async marcarEntrega(pedidoId, entregue, obs) {
      const { error } = await client.rpc("marcar_entrega_venda", {
        p_pedido_id: pedidoId,
        p_entregue: entregue,
        p_obs: obs,
      });
      if (error) {
        if (error.code === "P0001") throw new AppError("validation_error", error.message, error);
        if (error.code === "P0002") throw new AppError("not_found", "Pedido não encontrado.", error);
        throw new AppError("internal_error", "Falha ao registrar a entrega", error);
      }
    },

    async pedidosPorCodigo(churchId, codigo) {
      const { data, error } = await client
        .from("venda_pedidos")
        .select(COLS_PEDIDO)
        .eq("church_id", churchId)
        .eq("voucher_codigo", codigo)
        .limit(20);
      if (error) throw new AppError("internal_error", "Falha ao buscar o voucher", error);
      const pedidos = ((data ?? []) as PedidoRow[]).map(toPedido);
      return comVendas(pedidos);
    },

    async pedidoPorVoucherHash(hash) {
      const { data, error } = await client
        .from("venda_pedidos")
        .select(COLS_PEDIDO)
        .eq("voucher_hash", hash)
        .maybeSingle<PedidoRow>();
      if (error) throw new AppError("internal_error", "Falha ao buscar o voucher", error);
      if (!data) return null;
      return (await comVendas([toPedido(data)]))[0] ?? null;
    },

    async quemEntregou(pedidoId) {
      const { data, error } = await client.rpc("quem_entregou_venda", { p_pedido_id: pedidoId });
      if (error) return null;
      return (data as string | null) ?? null;
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
          tem_opcoes: boolean;
          opcoes: Array<{ id: string; nome: string; preco_cents: number }> | null;
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
          temOpcoes: r.tem_opcoes,
          opcoes: (r.opcoes ?? []).map((o) => ({ id: o.id, nome: o.nome, precoCents: o.preco_cents })),
        }),
      );
    },

    async criarPedido({ vendaId, nome, telefone, quantidade, observacao, itens, voucherHash }) {
      const { data, error } = await admin.rpc("criar_pedido_venda", {
        p_venda_id: vendaId,
        p_nome: nome,
        p_telefone: telefone,
        p_quantidade: quantidade,
        p_observacao: observacao,
        p_itens: itens.map((i) => ({ opcao_id: i.opcaoId, quantidade: i.quantidade })),
        p_voucher_hash: voucherHash,
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
          whatsapp_comprovante: string | null;
          voucher_codigo: string | null;
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
        whatsappComprovante: row.whatsapp_comprovante,
        voucherCodigo: row.voucher_codigo,
      };
    },

    async voucher(token) {
      const { data, error } = await client.rpc("voucher_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao abrir o voucher", error);
      const row = (
        (data ?? []) as Array<{
          titulo: string;
          church_name: string;
          primeiro_nome: string;
          codigo: string | null;
          itens: Array<{ nome: string; quantidade: number }> | null;
          total_cents: number;
          pago: boolean;
          cancelado: boolean;
          entregue_em: string | null;
        }>
      )[0];
      if (!row) return null;
      return {
        titulo: row.titulo,
        churchName: row.church_name,
        primeiroNome: row.primeiro_nome,
        codigo: row.codigo,
        itens: row.itens ?? [],
        totalCents: row.total_cents,
        pago: row.pago,
        cancelado: row.cancelado,
        entregueEm: row.entregue_em,
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
          whatsapp_comprovante: string | null;
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
        whatsapp: row.whatsapp_comprovante,
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
