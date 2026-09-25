import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchLeadersRepository } from "@/services/churchLeadersService";
import type { ChurchCargo, ChurchLeader } from "@/types/churchLeaders";

const COLUNAS = "id, church_id, cargo, nome, email, telefone, convidado_em, user_id, desde";

interface LeaderRow {
  id: string;
  church_id: string;
  cargo: ChurchCargo;
  nome: string;
  email: string | null;
  telefone: string | null;
  convidado_em: string | null;
  user_id: string | null;
  desde: string;
}

function toLeader(row: LeaderRow): ChurchLeader {
  return {
    id: row.id,
    churchId: row.church_id,
    cargo: row.cargo,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    convidadoEm: row.convidado_em,
    temAcesso: row.user_id !== null,
    desde: row.desde,
  };
}

/**
 * Cargos da igreja. O client do usuário basta: `church_leaders` só é lida por
 * owner/admin da igreja e das que estão acima, e só escrita por owner/admin da
 * própria empresa (GRANT por coluna + policy). O filtro por igreja/empresa é
 * repetido aqui, como manda o CLAUDE.md.
 */
export function createSupabaseChurchLeadersRepository(client: SupabaseClient): ChurchLeadersRepository {
  return {
    async listCompanyChurches(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },

    async listLeaders(churchIds) {
      if (churchIds.length === 0) return [];
      const { data, error } = await client
        .from("church_leaders")
        .select(COLUNAS)
        .in("church_id", churchIds)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw new AppError("internal_error", "Falha ao carregar os cargos", error);
      return ((data ?? []) as LeaderRow[]).map(toLeader);
    },

    async listPastors(churchIds) {
      const { data, error } = await client
        .from("church_leaders")
        .select("church_id, nome")
        .eq("cargo", "pastor")
        .in("church_id", churchIds)
        .is("deleted_at", null);
      if (error) throw new AppError("internal_error", "Falha ao carregar os pastores", error);
      const porIgreja: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ church_id: string; nome: string }>) {
        porIgreja[row.church_id] = row.nome;
      }
      return porIgreja;
    },

    async create({ churchId, cargo, nome, email, telefone }) {
      const { data, error } = await client
        .from("church_leaders")
        .insert({ church_id: churchId, cargo, nome, email, telefone })
        .select(COLUNAS)
        .single<LeaderRow>();
      if (error) {
        // 23505 = já existe um Pastor ativo (outra aba cadastrou entre a checagem e o insert).
        if (error.code === "23505") {
          throw new AppError("conflict", "Esta igreja já tem um Pastor registrado. Atualize a página.", error);
        }
        throw new AppError("internal_error", "Falha ao registrar o cargo", error);
      }
      return toLeader(data);
    },

    async markInvited({ leaderId, churchId }) {
      const { error } = await client
        .from("church_leaders")
        .update({ convidado_em: new Date().toISOString() })
        .eq("id", leaderId)
        .eq("church_id", churchId);
      if (error) throw new AppError("internal_error", "Falha ao marcar o convite", error);
    },

    async remove({ leaderId, churchId }) {
      const { data, error } = await client
        .from("church_leaders")
        .update({ deleted_at: new Date().toISOString(), ate: new Date().toISOString().slice(0, 10) })
        .eq("id", leaderId)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw new AppError("internal_error", "Falha ao remover o cargo", error);
      return (data ?? []).length > 0;
    },
  };
}
