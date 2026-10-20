import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { MensalidadeDaUnidade, MesDaRede, SemanaDaRede, UnidadeDaRede } from "@/lib/painelRede";
import type { RedePainelRepository } from "@/services/redePainelService";

/**
 * Painel da rede. As quatro funções do banco conferem que quem chama
 * administra a empresa; para qualquer outra pessoa vêm vazias.
 */

interface UnidadeRow {
  church_id: string;
  church_name: string;
  tipo: string;
  parent_id: string | null;
  nivel: number;
  pagina_ativa: boolean;
  membros_ativos: number;
  membros_afastados: number;
  membros_novos_90d: number;
  culto_ultima_chamada: string | null;
  culto_presenca_8_semanas: number | string | null;
  culto_em_alerta: number;
  culto_visitantes_30d: number;
  ebd_classes: number;
  ebd_matriculados: number;
  ebd_ultima_aula: string | null;
  ebd_presenca_8_semanas: number | string | null;
  visitas_sem_contato: number;
  visitas_feitas_90d: number;
  eventos_proximos: number;
  dizimos_mes_centavos: number | string;
  ofertas_mes_centavos: number | string;
  mensalidade: MensalidadeDaUnidade | null;
}

/** `numeric` e `bigint` podem chegar como texto. */
const numero = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function createSupabaseRedePainelRepository(client: SupabaseClient): RedePainelRepository {
  return {
    async temUnidades(companyId) {
      const { data, error } = await client.rpc("rede_tem_unidades", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao verificar a rede", error);
      return data === true;
    },

    async unidades(companyId) {
      const { data, error } = await client.rpc("rede_painel_unidades", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas da rede", error);
      return ((data ?? []) as UnidadeRow[]).map((r): UnidadeDaRede => ({
        churchId: r.church_id,
        churchName: r.church_name,
        tipo: r.tipo,
        parentId: r.parent_id,
        nivel: r.nivel,
        paginaAtiva: r.pagina_ativa,
        membrosAtivos: r.membros_ativos,
        membrosAfastados: r.membros_afastados,
        membrosNovos90d: r.membros_novos_90d,
        cultoUltimaChamada: r.culto_ultima_chamada,
        cultoPresenca8s: numero(r.culto_presenca_8_semanas),
        cultoEmAlerta: r.culto_em_alerta,
        cultoVisitantes30d: r.culto_visitantes_30d,
        ebdClasses: r.ebd_classes,
        ebdMatriculados: r.ebd_matriculados,
        ebdUltimaAula: r.ebd_ultima_aula,
        ebdPresenca8s: numero(r.ebd_presenca_8_semanas),
        visitasSemContato: r.visitas_sem_contato,
        visitasFeitas90d: r.visitas_feitas_90d,
        eventosProximos: r.eventos_proximos,
        dizimosMesCents: Number(r.dizimos_mes_centavos),
        ofertasMesCents: Number(r.ofertas_mes_centavos),
        mensalidade: r.mensalidade,
      }));
    },

    async semanas(companyId) {
      const { data, error } = await client.rpc("rede_painel_semanas", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar a presença da rede", error);
      return (
        (data ?? []) as Array<{
          church_id: string;
          semana: string;
          culto_presentes: number;
          culto_ausentes: number;
          culto_visitantes: number;
          ebd_presentes: number;
          ebd_ausentes: number;
        }>
      ).map((r): SemanaDaRede => ({
        churchId: r.church_id,
        semana: r.semana,
        cultoPresentes: r.culto_presentes,
        cultoAusentes: r.culto_ausentes,
        cultoVisitantes: r.culto_visitantes,
        ebdPresentes: r.ebd_presentes,
        ebdAusentes: r.ebd_ausentes,
      }));
    },

    async meses(companyId) {
      const { data, error } = await client.rpc("rede_painel_meses", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os totais da rede", error);
      return (
        (data ?? []) as Array<{
          church_id: string;
          mes: string;
          dizimos_centavos: number | string;
          ofertas_centavos: number | string;
          membros_novos: number;
        }>
      ).map((r): MesDaRede => ({
        churchId: r.church_id,
        mes: r.mes,
        dizimosCents: Number(r.dizimos_centavos),
        ofertasCents: Number(r.ofertas_centavos),
        membrosNovos: r.membros_novos,
      }));
    },
  };
}
