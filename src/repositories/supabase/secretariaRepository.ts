import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SecretariaRepository } from "@/services/secretariaService";
import type { HistoricoItem, ModeloGravado, TipoDocumento, TipoHistorico } from "@/types/secretaria";

/**
 * Secretaria sobre o client do usuário: a RLS só devolve o histórico da
 * própria igreja a quem tem o módulo Membros. Escrever é só pelas funções do
 * banco, que conferem o acesso de novo.
 */
export function createSupabaseSecretariaRepository(client: SupabaseClient): SecretariaRepository {
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

    async historico(membroId) {
      const { data, error } = await client
        .from("rol_membro_historico")
        .select("id, tipo, titulo, detalhe, data")
        .eq("membro_id", membroId)
        .is("deleted_at", null)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new AppError("internal_error", "Falha ao carregar o histórico", error);
      return (
        (data ?? []) as Array<{ id: string; tipo: TipoHistorico; titulo: string; detalhe: string | null; data: string }>
      ).map((r): HistoricoItem => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, detalhe: r.detalhe, data: r.data }));
    },

    async anotar(membroId, { titulo, detalhe, data }) {
      const { data: id, error } = await client.rpc("registrar_historico_membro", {
        p_membro_id: membroId,
        p_titulo: titulo,
        p_detalhe: detalhe,
        p_data: data,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado.");
        if (error.code === "22023" || error.code === "23514") {
          throw new AppError("validation_error", "Confira os dados da anotação.");
        }
        throw new AppError("internal_error", "Falha ao registrar no histórico", error);
      }
      return id as string;
    },

    async excluirAnotacao(id) {
      const { error } = await client.rpc("excluir_historico_membro", { p_id: id });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Registro não encontrado.");
        if (error.code === "42501") {
          throw new AppError("forbidden", "Só anotações feitas à mão podem ser excluídas do histórico.");
        }
        throw new AppError("internal_error", "Falha ao excluir a anotação", error);
      }
    },

    async modelosVigentes(churchId) {
      const { data, error } = await client.rpc("documento_modelos_vigentes", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os modelos de documento", error);
      return (
        (data ?? []) as Array<{
          tipo: TipoDocumento;
          titulo: string;
          corpo: string;
          origem_church_id: string;
          origem_nome: string;
        }>
      ).map((r): ModeloGravado => ({
        tipo: r.tipo,
        titulo: r.titulo,
        corpo: r.corpo,
        origemChurchId: r.origem_church_id,
        origemNome: r.origem_nome,
      }));
    },

    async salvarModelo(churchId, tipo, titulo, corpo) {
      const { error } = await client.rpc("salvar_documento_modelo", {
        p_church_id: churchId,
        p_tipo: tipo,
        p_titulo: titulo,
        p_corpo: corpo,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.");
        if (error.code === "23514") throw new AppError("validation_error", "Confira o tamanho do título e do texto.");
        throw new AppError("internal_error", "Falha ao salvar o modelo", error);
      }
    },

    async restaurarModelo(churchId, tipo) {
      const { error } = await client.rpc("restaurar_documento_modelo", { p_church_id: churchId, p_tipo: tipo });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.");
        throw new AppError("internal_error", "Falha ao restaurar o modelo", error);
      }
    },

    async dadosDaIgreja(churchId) {
      const { data, error } = await client.rpc("documento_dados_da_igreja", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os dados da igreja", error);
      const row = (
        (data ?? []) as Array<{
          nome: string;
          sobrenome: string | null;
          endereco: string | null;
          saudacao: string | null;
          pastor: string | null;
        }>
      )[0];
      return row ?? null;
    },

    async registrarEmissao(membroId, tipo, destino) {
      const { error } = await client.rpc("registrar_documento_emitido", {
        p_membro_id: membroId,
        p_tipo: tipo,
        p_destino: destino,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado.");
        throw new AppError("internal_error", "Falha ao registrar o documento no histórico", error);
      }
    },
  };
}
