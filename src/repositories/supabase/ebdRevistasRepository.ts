import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { EbdRevistasRepository } from "@/services/ebdRevistasService";
import type {
  EbdRevista,
  EbdRevistaPedido,
  EbdRevistasDoTrimestre,
  EbdSemPedido,
  FormaDePagamentoDaRevista,
} from "@/types/ebdRevistas";

/**
 * EBD → Revistas sobre o client do usuário. Tudo passa pelas funções ebd_*
 * (security definer), que conferem que quem pede é da gestão da EBD da igreja.
 */

type Linha = Record<string, unknown>;

/** Erros das funções do banco que viram mensagem para a pessoa. */
function erro(
  error: { code?: string; message?: string },
  padrao: string,
  mensagens: Record<string, string> = {},
): never {
  const mensagem = error.code ? mensagens[error.code] : undefined;
  if (mensagem) {
    const tipo = error.code === "P0002" ? "not_found" : error.code === "23505" ? "conflict" : "validation_error";
    throw new AppError(tipo, mensagem, error);
  }
  if (error.code === "42501") throw new AppError("forbidden", "Você não tem permissão para isso.", error);
  throw new AppError("internal_error", padrao, error);
}

export function createSupabaseEbdRevistasRepository(client: SupabaseClient): EbdRevistasRepository {
  return {
    async listaDaIgreja(churchId) {
      const { data, error } = await client.rpc("ebd_revistas_lista_da_igreja", { p_church_id: churchId });
      if (error) erro(error, "Falha ao carregar a lista de revistas");
      if (!data) return null;
      const r = data as Linha;
      return {
        donaId: r.dona_id as string,
        donaNome: r.dona_nome as string,
        propria: Boolean(r.propria),
        temCongregacoes: Boolean(r.tem_congregacoes),
        trimestres: ((r.trimestres ?? []) as Linha[]).map((t) => ({
          id: t.id as string,
          nome: t.nome as string,
          inicio: t.inicio as string,
          fim: t.fim as string,
        })),
      };
    },

    async rede(trimestreId) {
      const { data, error } = await client.rpc("ebd_revistas_rede", { p_trimestre_id: trimestreId });
      if (error) erro(error, "Falha ao carregar os pedidos da rede");
      if (!data) return null;
      const r = data as { igrejas?: Linha[]; externos?: Linha[] };
      const itens = (lista: unknown) =>
        ((lista ?? []) as Linha[]).map((i) => ({
          revistaId: i.revista_id as string,
          quantidade: Number(i.quantidade ?? 0),
        }));
      return {
        igrejas: (r.igrejas ?? []).map((i) => ({
          churchId: i.church_id as string,
          nome: i.nome as string,
          propria: Boolean(i.propria),
          pedidos: Number(i.pedidos ?? 0),
          itens: itens(i.itens),
        })),
        externos: (r.externos ?? []).map((e) => ({
          id: e.id as string,
          nome: e.nome as string,
          itens: itens(e.itens),
        })),
      };
    },

    async salvarExterno({ id, trimestreId, nome, itens }) {
      const { data, error } = await client.rpc("ebd_salvar_pedido_externo", {
        p_id: id,
        p_trimestre_id: trimestreId,
        p_nome: nome,
        p_itens: itens.map((i) => ({ revista_id: i.revistaId, quantidade: i.quantidade })),
      });
      if (error) {
        erro(error, "Falha ao salvar o pedido da congregação", {
          P0002: "Pedido ou trimestre não encontrado. Atualize a página.",
          "23514": "Confira o nome e as quantidades. Atualize a página se a lista de revistas mudou.",
        });
      }
      return data as string;
    },

    async removerExterno(id) {
      const { error } = await client.rpc("ebd_remover_pedido_externo", { p_id: id });
      if (error)
        erro(error, "Falha ao remover o pedido da congregação", { P0002: "Pedido não encontrado. Atualize a página." });
    },

    async doTrimestre(trimestreId, churchId) {
      const { data, error } = await client.rpc("ebd_revistas_do_trimestre", {
        p_trimestre_id: trimestreId,
        p_church_id: churchId,
      });
      if (error) erro(error, "Falha ao carregar os pedidos de revista");
      if (!data) return null;
      const r = data as { revistas?: Linha[]; pedidos?: Linha[]; sem_pedido?: Linha[] };
      const resultado: EbdRevistasDoTrimestre = {
        revistas: (r.revistas ?? []).map((x): EbdRevista => ({
          id: x.id as string,
          titulo: x.titulo as string,
          precoCentavos: Number(x.preco_centavos ?? 0),
          classeId: (x.classe_id as string | null) ?? null,
          classeNome: (x.classe_nome as string | null) ?? null,
        })),
        pedidos: (r.pedidos ?? []).map((x): EbdRevistaPedido => ({
          id: x.id as string,
          membroId: (x.membro_id as string | null) ?? null,
          nome: (x.nome as string | null) ?? "Sem nome",
          telefone: (x.telefone as string | null) ?? null,
          deFora: Boolean(x.de_fora),
          classeNome: (x.classe_nome as string | null) ?? null,
          observacao: (x.observacao as string | null) ?? null,
          entregueEm: (x.entregue_em as string | null) ?? null,
          cancelado: Boolean(x.cancelado),
          criadoEm: x.criado_em as string,
          itens: ((x.itens ?? []) as Linha[]).map((i) => ({
            revistaId: i.revista_id as string,
            titulo: i.titulo as string,
            quantidade: Number(i.quantidade ?? 0),
            precoCentavos: Number(i.preco_centavos ?? 0),
          })),
          pagamentos: ((x.pagamentos ?? []) as Linha[]).map((g) => ({
            id: g.id as string,
            valorCentavos: Number(g.valor_centavos ?? 0),
            data: g.data as string,
            forma: g.forma as FormaDePagamentoDaRevista,
          })),
        })),
        semPedido: (r.sem_pedido ?? []).map((x): EbdSemPedido => ({
          membroId: x.membro_id as string,
          nome: x.nome as string,
          classeId: x.classe_id as string,
          classeNome: x.classe_nome as string,
        })),
      };
      return resultado;
    },

    async salvarRevista({ id, trimestreId, titulo, precoCentavos, classeId }) {
      const { data, error } = await client.rpc("ebd_salvar_revista", {
        p_id: id,
        p_trimestre_id: trimestreId,
        p_titulo: titulo,
        p_preco_centavos: precoCentavos,
        p_classe_id: classeId,
      });
      if (error) {
        erro(error, "Falha ao salvar a revista", {
          P0002: "Revista ou trimestre não encontrado. Atualize a página.",
          "23514": "Confira o título, o preço e a classe da revista.",
        });
      }
      return data as string;
    },

    async removerRevista(id) {
      const { error } = await client.rpc("ebd_remover_revista", { p_id: id });
      if (error) {
        erro(error, "Falha ao remover a revista", {
          P0002: "Revista não encontrada. Atualize a página.",
          "23503": "Esta revista já tem pedido. Cancele ou altere os pedidos dela antes de remover.",
        });
      }
    },

    async copiarRevistas(deTrimestreId, paraTrimestreId) {
      const { data, error } = await client.rpc("ebd_copiar_revistas", {
        p_de_trimestre_id: deTrimestreId,
        p_para_trimestre_id: paraTrimestreId,
      });
      if (error) erro(error, "Falha ao copiar as revistas", { P0002: "Trimestre não encontrado. Atualize a página." });
      return Number(data ?? 0);
    },

    async salvarPedido({ id, trimestreId, churchId, membroId, nome, telefone, observacao, itens }) {
      const { data, error } = await client.rpc("ebd_salvar_pedido_revista", {
        p_id: id,
        p_trimestre_id: trimestreId,
        p_membro_id: membroId,
        p_nome: nome,
        p_telefone: telefone,
        p_observacao: observacao,
        p_itens: itens.map((i) => ({ revista_id: i.revistaId, quantidade: i.quantidade })),
        p_church_id: churchId,
      });
      if (error) {
        erro(error, "Falha ao salvar o pedido", {
          P0002: "Pedido ou trimestre não encontrado. Atualize a página.",
          "23505": "Esta pessoa já tem um pedido neste trimestre. Abra o pedido dela para acrescentar a revista.",
          "23514": "Confira a pessoa e as revistas do pedido. Atualize a página se a lista de revistas mudou.",
        });
      }
      return data as string;
    },

    async registrarPagamento({ pedidoId, valorCentavos, data, forma }) {
      const { data: novo, error } = await client.rpc("ebd_registrar_pagamento_revista", {
        p_pedido_id: pedidoId,
        p_valor_centavos: valorCentavos,
        p_data: data,
        p_forma: forma,
      });
      if (error) {
        erro(error, "Falha ao registrar o pagamento", {
          P0002: "Pedido não encontrado (ou cancelado). Atualize a página.",
          "23514": "O valor é maior do que falta pagar, ou a data não confere.",
        });
      }
      return novo as string;
    },

    async estornarPagamento(pagamentoId) {
      const { error } = await client.rpc("ebd_estornar_pagamento_revista", { p_pagamento_id: pagamentoId });
      if (error)
        erro(error, "Falha ao desfazer o pagamento", { P0002: "Pagamento não encontrado. Atualize a página." });
    },

    async marcarEntrega(pedidoId, entregue) {
      const { error } = await client.rpc("ebd_marcar_entrega_revista", { p_pedido_id: pedidoId, p_entregue: entregue });
      if (error)
        erro(error, "Falha ao marcar a entrega", { P0002: "Pedido não encontrado (ou cancelado). Atualize a página." });
    },

    async cancelarPedido(pedidoId) {
      const { error } = await client.rpc("ebd_cancelar_pedido_revista", { p_pedido_id: pedidoId });
      if (error) erro(error, "Falha ao cancelar o pedido", { P0002: "Pedido não encontrado. Atualize a página." });
    },
  };
}
