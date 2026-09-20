import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ChurchScheduleRepository,
  ScheduleItemWithChurch,
} from "@/services/churchScheduleService";
import type { ChurchScheduleItem } from "@/types/database";

const COLUNAS = "id, church_id, titulo, tipo, dia_semana, data, hora, descricao, local";

/**
 * Programação no painel, com o client do usuário: a RLS só deixa gravar quem
 * administra a igreja. O company_id é repetido em toda consulta.
 */
export function createSupabaseChurchScheduleRepository(client: SupabaseClient): ChurchScheduleRepository {
  return {
    async listCompanySchedule(companyId) {
      const { data, error } = await client
        .from("church_schedule")
        .select(`${COLUNAS}, churches(name)`)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("hora");
      if (error) throw new AppError("internal_error", "Falha ao carregar a programação", error);
      // A tipagem gerada trata a igreja relacionada como lista; numa relação
      // muitos-para-um o PostgREST devolve objeto. Aceita os dois.
      type Linha = ChurchScheduleItem & { churches: { name: string } | Array<{ name: string }> | null };
      return ((data ?? []) as unknown as Linha[]).map(({ churches, ...item }): ScheduleItemWithChurch => {
        const igreja = Array.isArray(churches) ? churches[0] : churches;
        return { ...item, churchName: igreja?.name ?? "" };
      });
    },

    async listCompanyChurches(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao listar as igrejas", error);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },

    async updateItem(companyId, itemId, input) {
      // O filtro por empresa vai junto do update: id de outra igreja não muda.
      const { data, error } = await client
        .from("church_schedule")
        .update({
          titulo: input.titulo,
          tipo: input.tipo,
          dia_semana: input.diaSemana,
          data: input.data,
          hora: input.hora,
          descricao: input.descricao,
          local: input.local,
        })
        .eq("id", itemId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao editar a programação", error);
      return (data ?? []).length > 0;
    },

    async insertItem(input) {
      const { data, error } = await client
        .from("church_schedule")
        .insert({
          church_id: input.churchId,
          titulo: input.titulo,
          tipo: input.tipo,
          dia_semana: input.diaSemana,
          data: input.data,
          hora: input.hora,
          descricao: input.descricao,
          local: input.local,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        if (error?.code === "42501") {
          throw new AppError("forbidden", "Só quem administra a igreja pode mudar a programação.", error);
        }
        throw new AppError("internal_error", "Não foi possível adicionar à programação.", error);
      }
      return data.id;
    },

    async softDeleteItem(companyId, itemId) {
      const { data, error } = await client
        .from("church_schedule")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", itemId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Não foi possível remover.", error);
      return (data ?? []).length > 0;
    },
  };
}
