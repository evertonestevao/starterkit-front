import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CargoRow, CargosRepository } from "@/services/cargosService";

interface Linha {
  id: string;
  church_id: string | null;
  slug: string | null;
  nome: string;
  descricao: string | null;
  unico: boolean;
  ordem: number;
  deleted_at: string | null;
  dono_nome: string | null;
}

function toRow(l: Linha): CargoRow {
  return {
    id: l.id,
    churchId: l.church_id,
    donoNome: l.dono_nome,
    slug: l.slug,
    nome: l.nome,
    descricao: l.descricao,
    unico: l.unico,
    ordem: l.ordem,
    desativado: l.deleted_at !== null,
  };
}

/**
 * Catálogo de cargos com o client do usuário. A leitura é pela RPC
 * cargos_visiveis (padrão + igrejas acima + a própria); a escrita sempre vai
 * com church_id da igreja ativa, e a RLS só deixa o dono gravar.
 */
export function createSupabaseCargosRepository(client: SupabaseClient): CargosRepository {
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
      return data ? { id: data.id, name: data.name } : null;
    },

    async listVisiveis(churchId) {
      // RPC: padrão + igrejas de cima + a própria, conferindo que a pessoa é
      // da igreja. Ler `churches` de cima direto dependeria da RLS delas.
      const { data, error } = await client.rpc("cargos_visiveis", { p_church: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os cargos", error);
      return ((data ?? []) as Linha[]).map(toRow);
    },

    async meusCargos(companyId) {
      const { data, error } = await client.rpc("meus_cargos", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os seus cargos", error);
      return ((data ?? []) as Array<{ nome: string }>).map((c) => c.nome);
    },

    async pastoresDasIgrejas(churchIds) {
      const { data, error } = await client.rpc("pastores_das_igrejas", { p_church_ids: churchIds });
      if (error) throw new AppError("internal_error", "Falha ao carregar os pastores", error);
      const porIgreja: Record<string, string> = {};
      for (const r of (data ?? []) as Array<{ church_id: string; nome: string }>) porIgreja[r.church_id] = r.nome;
      return porIgreja;
    },

    async create(churchId, input) {
      const { data, error } = await client
        .from("cargos")
        .insert({
          church_id: churchId,
          nome: input.nome,
          descricao: input.descricao,
          unico: input.unico,
          ordem: input.ordem,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "Já existe um cargo com esse nome.", error);
        throw new AppError("internal_error", "Falha ao criar o cargo", error);
      }
      return data.id;
    },

    async update(churchId, cargoId, input) {
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome;
      if (input.descricao !== undefined) patch.descricao = input.descricao;
      if (input.unico !== undefined) patch.unico = input.unico;
      if (input.ordem !== undefined) patch.ordem = input.ordem;
      if (input.desativado !== undefined) patch.deleted_at = input.desativado ? new Date().toISOString() : null;
      const { data, error } = await client
        .from("cargos")
        .update(patch)
        .eq("id", cargoId)
        .eq("church_id", churchId)
        .select("id");
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "Já existe um cargo com esse nome.", error);
        throw new AppError("internal_error", "Falha ao salvar o cargo", error);
      }
      return (data ?? []).length > 0;
    },
  };
}
