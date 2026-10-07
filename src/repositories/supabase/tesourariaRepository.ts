import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { TesourariaRepository } from "@/services/tesourariaService";
import type { CultoOpcao, FormaLancamento, Lancamento, TipoLancamento } from "@/types/tesouraria";

const COLS = "id, data, schedule_id, culto_titulo, tipo, valor_centavos, forma, membro_id, nome, observacao";

interface Row {
  id: string;
  data: string;
  schedule_id: string | null;
  culto_titulo: string | null;
  tipo: TipoLancamento;
  valor_centavos: number;
  forma: FormaLancamento;
  membro_id: string | null;
  nome: string | null;
  observacao: string | null;
}

const toLancamento = (r: Row): Lancamento => ({
  id: r.id,
  data: r.data,
  scheduleId: r.schedule_id,
  cultoTitulo: r.culto_titulo,
  tipo: r.tipo,
  valorCentavos: r.valor_centavos,
  forma: r.forma,
  membroId: r.membro_id,
  nome: r.nome,
  observacao: r.observacao,
});

/** Um mês de igreja pequena cabe folgado; o teto evita uma leitura sem fim. */
const PAGINA = 1000;
const TETO = 10_000;

/**
 * Tesouraria sobre o client do usuário: a RLS só devolve lançamentos da
 * igreja de quem tem o módulo. Gravar é só pelas funções do banco, que
 * conferem o acesso de novo e que culto e membro são da mesma igreja.
 */
export function createSupabaseTesourariaRepository(client: SupabaseClient): TesourariaRepository {
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

    async listar(churchId, de, ate) {
      const todos: Lancamento[] = [];
      for (let inicio = 0; inicio < TETO; inicio += PAGINA) {
        const { data, error } = await client
          .from("tesouraria_lancamentos")
          .select(COLS)
          .eq("church_id", churchId)
          .is("deleted_at", null)
          .gte("data", de)
          .lte("data", ate)
          .order("data", { ascending: false })
          .order("created_at", { ascending: false })
          .range(inicio, inicio + PAGINA - 1);
        if (error) throw new AppError("internal_error", "Falha ao carregar os lançamentos", error);
        todos.push(...((data ?? []) as Row[]).map(toLancamento));
        if (!data || data.length < PAGINA) break;
      }
      return todos;
    },

    async salvar(churchId, id, input) {
      const { data, error } = await client.rpc("tesouraria_salvar", {
        p_id: id,
        p_church_id: churchId,
        p: {
          data: input.data,
          schedule_id: input.scheduleId ?? "",
          tipo: input.tipo,
          valor_centavos: input.valorCentavos,
          forma: input.forma,
          membro_id: input.membroId ?? "",
          nome: input.nome ?? "",
          observacao: input.observacao ?? "",
        },
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Lançamento, culto ou pessoa não encontrados.");
        if (error.code === "23514") throw new AppError("validation_error", "Confira os dados do lançamento.");
        throw new AppError("internal_error", "Falha ao salvar o lançamento", error);
      }
      return data as string;
    },

    async excluir(id) {
      const { error } = await client.rpc("tesouraria_excluir", { p_id: id });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Lançamento não encontrado.");
        throw new AppError("internal_error", "Falha ao excluir o lançamento", error);
      }
    },

    async cultos(churchId) {
      const { data, error } = await client
        .from("church_schedule")
        .select("id, titulo, tipo, dia_semana, data, hora")
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .order("hora");
      if (error) throw new AppError("internal_error", "Falha ao carregar os cultos", error);
      return (
        (data ?? []) as Array<{
          id: string;
          titulo: string;
          tipo: "semanal" | "especial";
          dia_semana: number | null;
          data: string | null;
          hora: string;
        }>
      ).map((c): CultoOpcao => ({
        id: c.id,
        titulo: c.titulo,
        tipo: c.tipo,
        diaSemana: c.dia_semana,
        data: c.data,
        hora: c.hora,
      }));
    },

    async buscarPessoas(churchId, termo) {
      const { data, error } = await client.rpc("tesouraria_buscar_pessoas", { p_church_id: churchId, p_termo: termo });
      if (error) throw new AppError("internal_error", "Falha ao buscar as pessoas", error);
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  };
}
