import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ChurchDomainRepository,
  ChurchDomainStatusWriter,
  DomainStatusUpdate,
  PendingDomain,
} from "@/services/churchDomainService";
import type { Church } from "@/types/database";

/**
 * Implementação Supabase do domínio próprio.
 *
 * Toda ESCRITA passa por RPC security definer (claim/set_verification/clear):
 * as colunas de domínio não têm GRANT de UPDATE para `authenticated`, então
 * não existe caminho de escrita direta nem por PostgREST.
 */

/** Violação do índice único de domínio. */
const UNIQUE_VIOLATION = "23505";
/** RAISE ... USING errcode = 'insufficient_privilege' nas RPCs. */
const INSUFFICIENT_PRIVILEGE = "42501";

const CHURCH_COLUMNS = "*";

export function createSupabaseChurchDomainRepository(
  client: SupabaseClient,
): ChurchDomainRepository {
  return {
    async findById(churchId) {
      const { data, error } = await client
        .from("churches")
        .select(CHURCH_COLUMNS)
        .eq("id", churchId)
        .is("deleted_at", null)
        .maybeSingle<Church>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      }
      return data;
    },

    async listByCompany(companyId) {
      const { data, error } = await client
        .from("churches")
        .select(CHURCH_COLUMNS)
        // Filtro por company_id replicado na query (não só na RLS), como manda
        // o CLAUDE.md para operação sensível.
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        throw new AppError("internal_error", "Falha ao listar igrejas", error);
      }
      return (data ?? []) as Church[];
    },

    async claim(churchId, domain) {
      const { data, error } = await client
        .rpc("claim_church_domain", { p_church_id: churchId, p_domain: domain })
        .single<Church>();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          throw new AppError(
            "conflict",
            "Este domínio já está cadastrado por outra igreja.",
            error,
          );
        }
        if (error.code === INSUFFICIENT_PRIVILEGE) {
          throw new AppError(
            "forbidden",
            "Você não tem permissão para configurar o domínio desta igreja.",
            error,
          );
        }
        throw new AppError("internal_error", "Falha ao registrar o domínio", error);
      }
      if (!data) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }
      return data;
    },

    async saveVerification(churchId, challenges, status) {
      const { error } = await client.rpc("set_church_domain_verification", {
        p_church_id: churchId,
        p_verificacao: challenges ?? null,
        p_status: status,
      });
      if (error) {
        throw new AppError(
          "internal_error",
          "Falha ao salvar as instruções de DNS",
          error,
        );
      }
    },

    async clear(churchId) {
      const { error } = await client.rpc("clear_church_domain", {
        p_church_id: churchId,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao remover o domínio", error);
      }
    },
  };
}

/**
 * Escritas privilegiadas de status. EXIGE um client service_role — é o único
 * caminho capaz de marcar um domínio como `ativo`, e por isso só pode ser
 * composto dentro de src/server (ver churchDomain.ts).
 */
export function createSupabaseChurchDomainStatusWriter(
  adminClient: SupabaseClient,
): ChurchDomainStatusWriter {
  return {
    async applyStatus(churchId: string, update: DomainStatusUpdate) {
      const payload: Record<string, unknown> = { dominio_status: update.status };

      if (update.challenges !== undefined) {
        payload.dominio_verificacao = update.challenges;
      }
      if (update.error !== undefined) {
        payload.dominio_ultimo_erro = update.error;
      }
      if (update.verifiedAt !== undefined) {
        payload.dominio_verificado_em = update.verifiedAt;
      }

      const { error } = await adminClient
        .from("churches")
        .update(payload)
        .eq("id", churchId);
      if (error) {
        throw new AppError(
          "internal_error",
          "Falha ao atualizar o status do domínio",
          error,
        );
      }
    },

    async listPendingVerification(limit: number): Promise<PendingDomain[]> {
      const { data, error } = await adminClient
        .from("churches")
        .select("id, dominio_customizado, dominio_status, dominio_solicitado_em")
        .in("dominio_status", ["pendente_dns", "verificando"])
        .not("dominio_customizado", "is", null)
        .is("deleted_at", null)
        // Mais antigos primeiro: ninguém fica para trás na fila do job.
        .order("dominio_solicitado_em", { ascending: true, nullsFirst: true })
        .limit(limit);

      if (error) {
        throw new AppError(
          "internal_error",
          "Falha ao listar domínios pendentes",
          error,
        );
      }
      return (data ?? []) as PendingDomain[];
    },
  };
}
