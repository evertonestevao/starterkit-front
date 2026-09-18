import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchEventsRepository, CompanyEvent } from "@/services/churchEventsService";

/**
 * Eventos do lado da igreja, com o client do usuário: a RLS de church_events
 * só deixa gravar quem administra a igreja, e a de event_signups só conta
 * inscritos da própria empresa. O filtro por company_id é repetido aqui.
 */
export function createSupabaseChurchEventsRepository(client: SupabaseClient): ChurchEventsRepository {
  return {
    async listCompanyEvents(companyId) {
      const { data, error } = await client.rpc("list_company_events", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao listar os eventos", error);
      return ((data ?? []) as Array<{
        id: string;
        church_id: string;
        church_name: string;
        titulo: string;
        descricao: string | null;
        inicio: string;
        fim: string | null;
        local: string | null;
        preco_cents: number;
        inscricoes_abertas: boolean;
        inscritos: number;
      }>).map(
        (row): CompanyEvent => ({
          id: row.id,
          churchId: row.church_id,
          churchName: row.church_name,
          titulo: row.titulo,
          descricao: row.descricao,
          inicio: row.inicio,
          fim: row.fim,
          local: row.local,
          precoCents: row.preco_cents,
          inscricoesAbertas: row.inscricoes_abertas,
          inscritos: row.inscritos,
        }),
      );
    },

    async listCompanyChurches(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name, address")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao listar as igrejas", error);
      return (data ?? []) as Array<{ id: string; name: string; address: string | null }>;
    },

    async insertEvent(input) {
      const { data, error } = await client
        .from("church_events")
        .insert({
          church_id: input.churchId,
          titulo: input.titulo,
          descricao: input.descricao,
          inicio: input.inicio,
          fim: input.fim,
          local: input.local,
          preco_cents: input.precoCents,
          inscricoes_abertas: input.inscricoesAbertas,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        if (error?.code === "42501") {
          throw new AppError("forbidden", "Só quem administra a igreja pode publicar eventos.", error);
        }
        throw new AppError("internal_error", "Não foi possível publicar o evento.", error);
      }
      return data.id;
    },
  };
}
