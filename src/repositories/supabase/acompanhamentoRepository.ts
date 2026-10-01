import type { SupabaseClient } from "@supabase/supabase-js";
import { ordenarResumos } from "@/lib/cargos";
import { AppError } from "@/lib/errors";
import type { AcompanhamentoRepository } from "@/services/acompanhamentoService";
import type {
  AcessoMembro,
  AlertaFaltas,
  ConvitePendente,
  ConfigAcompanhamento,
  ContatoRegistrado,
  Culto,
  FrequenciaMembro,
  HistoricoMembroItem,
  Justificativa,
  JustificativaLonga,
  MembrosKpis,
  Presenca,
  RelatorioChamada,
  ResumoAcompanhamento,
  ResumoRedeIgreja,
  RolMembro,
} from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";

/**
 * Chamada e Acompanhamento sobre o client do usuário: a RLS só abre a
 * própria igreja para quem pode acompanhar (`can_acompanhar`). O filtro por
 * church_id é repetido em toda consulta, como manda o CLAUDE.md.
 */

const MEMBRO_COLS =
  "id, church_id, nome, whatsapp, email, user_id, participa_chamada, membro_igreja, cuidados, nascimento, batismo, ativo, observacoes, " +
  "cargos:rol_membro_cargos(cargo:cargos(id, nome, ordem, deleted_at))";
// Cultos = itens da Programação.
const CULTO_COLS = "id, church_id, titulo, tipo, dia_semana, data, hora, registra_chamada, deleted_at";
const JUST_COLS = "id, membro_id, motivo, motivo_texto, data_inicio, data_fim, encerrada_em, membro:rol_membros(nome)";

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST mapeadas campo a campo abaixo */
const toCargoResumo = (c: any): CargoResumo => ({
  id: c.id,
  nome: c.nome,
  ordem: c.ordem,
  desativado: c.deleted_at !== null,
});

const toMembro = (r: any): RolMembro => ({
  id: r.id,
  churchId: r.church_id,
  nome: r.nome,
  // Relação muitos-para-um dentro da lista: objeto (às vezes lista na tipagem).
  cargos: ordenarResumos(
    ((r.cargos ?? []) as any[])
      .map((rc) => (Array.isArray(rc.cargo) ? rc.cargo[0] : rc.cargo))
      .filter(Boolean)
      .map(toCargoResumo),
  ),
  whatsapp: r.whatsapp,
  email: r.email,
  userId: r.user_id,
  participaChamada: r.participa_chamada,
  membroIgreja: r.membro_igreja,
  cuidados: r.cuidados ?? null,
  nascimento: r.nascimento,
  batismo: r.batismo ?? null,
  ativo: r.ativo,
  observacoes: r.observacoes,
});

const toCulto = (r: any): Culto => ({
  id: r.id,
  churchId: r.church_id,
  nome: r.titulo,
  tipo: r.tipo,
  diaSemana: r.dia_semana,
  data: r.data,
  hora: String(r.hora).slice(0, 5),
  registraChamada: r.registra_chamada,
  removido: r.deleted_at !== null,
});

const toJustificativa = (r: any): Justificativa => ({
  id: r.id,
  membroId: r.membro_id,
  membroNome: r.membro?.nome ?? "",
  motivo: r.motivo,
  motivoTexto: r.motivo_texto,
  dataInicio: r.data_inicio,
  dataFim: r.data_fim,
  encerradaEm: r.encerrada_em,
});

const n = (v: unknown) => Number(v ?? 0);
/* eslint-enable @typescript-eslint/no-explicit-any */

function falha(mensagem: string, error: unknown): never {
  throw new AppError("internal_error", mensagem, error);
}

export function createSupabaseAcompanhamentoRepository(client: SupabaseClient): AcompanhamentoRepository {
  async function rpc<T>(fn: string, args: Record<string, unknown>, mensagem: string): Promise<T[]> {
    const { data, error } = await client.rpc(fn, args);
    if (error) falha(mensagem, error);
    return (data ?? []) as T[];
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
      if (error) falha("Falha ao carregar a igreja", error);
      return data;
    },

    // ---------------------------------------------------------- membros
    async listMembros(churchId) {
      const { data, error } = await client
        .from("rol_membros")
        .select(MEMBRO_COLS)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .order("nome");
      if (error) falha("Falha ao carregar os membros", error);
      return (data ?? []).map(toMembro);
    },

    async listMembrosPagina(churchId, { busca, incluirInativos, cargoId, limit, offset }) {
      // Filtro por cargo: primeiro quem tem o cargo nesta igreja.
      let comCargo: string[] | null = null;
      if (cargoId) {
        const { data: rc, error: rcError } = await client
          .from("rol_membro_cargos")
          .select("membro_id")
          .eq("church_id", churchId)
          .eq("cargo_id", cargoId);
        if (rcError) falha("Falha ao filtrar por cargo", rcError);
        comCargo = (rc ?? []).map((r: { membro_id: string }) => r.membro_id);
        if (comCargo.length === 0) return { items: [], total: 0 };
      }
      let q = client
        .from("rol_membros")
        .select(MEMBRO_COLS, { count: "exact" })
        .eq("church_id", churchId)
        .is("deleted_at", null);
      if (!incluirInativos) q = q.eq("ativo", true);
      if (comCargo) q = q.in("id", comCargo);
      // % e _ do termo são literais, não curingas do LIKE.
      if (busca) q = q.ilike("nome_busca", `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await q.order("nome").range(offset, offset + limit - 1);
      if (error) falha("Falha ao carregar os membros", error);
      return { items: (data ?? []).map(toMembro), total: count ?? 0 };
    },

    async listAcessos(companyId) {
      const [membros, convites] = await Promise.all([
        client
          .from("company_members")
          .select("id, user_id, role, pode_acompanhar, pode_gerir_ebd")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        // Para quem não é admin a RLS devolve vazio — e está certo assim.
        client
          .from("company_invites")
          .select("id, email, role, expires_at")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .is("deleted_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);
      if (membros.error) falha("Falha ao carregar os acessos", membros.error);
      if (convites.error) falha("Falha ao carregar os convites", convites.error);
      return {
        acessos: (membros.data ?? []).map(
          (r: {
            id: string;
            user_id: string;
            role: AcessoMembro["role"];
            pode_acompanhar: boolean;
            pode_gerir_ebd: boolean;
          }): AcessoMembro => ({
            companyMemberId: r.id,
            userId: r.user_id,
            role: r.role,
            podeAcompanhar: r.pode_acompanhar,
            podeGerirEbd: r.pode_gerir_ebd,
          }),
        ),
        convites: (convites.data ?? []).map(
          (r: { id: string; email: string; role: ConvitePendente["role"]; expires_at: string }): ConvitePendente => ({
            id: r.id,
            email: r.email,
            role: r.role,
            expiraEm: r.expires_at,
          }),
        ),
      };
    },

    async listEmailsDoRol(churchId) {
      const { data, error } = await client
        .from("rol_membros")
        .select("email")
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .not("email", "is", null);
      if (error) falha("Falha ao carregar os e-mails dos membros", error);
      return (data ?? []).map((r: { email: string }) => r.email.toLowerCase());
    },

    async kpisMembros(churchId) {
      const [r] = await rpc<Record<string, unknown>>("membros_kpis", { p_church_id: churchId }, "Falha ao calcular os indicadores");
      return {
        ativos: n(r?.ativos),
        inativos: n(r?.inativos),
        naoMembros: n(r?.nao_membros),
        novosNoMes: n(r?.novos_no_mes),
        aniversariantesDoMes: n(r?.aniversariantes_do_mes),
        comCargo: n(r?.com_cargo),
        presencaMedia: r?.presenca_media === null || r?.presenca_media === undefined ? null : Number(r.presenca_media),
        emAlerta: n(r?.em_alerta),
      } satisfies MembrosKpis;
    },

    async listCargosDisponiveis(churchId) {
      const { data, error } = await client.rpc("cargos_visiveis", { p_church: churchId });
      if (error) falha("Falha ao carregar os cargos", error);
      return ordenarResumos(
        ((data ?? []) as Array<{ deleted_at: string | null }>)
          .filter((c) => c.deleted_at === null)
          .map(toCargoResumo),
      );
    },

    async setCargosDoMembro(churchId, membroId, cargoIds) {
      const { data: atuais, error } = await client
        .from("rol_membro_cargos")
        .select("cargo_id")
        .eq("church_id", churchId)
        .eq("membro_id", membroId);
      if (error) falha("Falha ao carregar os cargos do membro", error);
      const tinha = new Set((atuais ?? []).map((r: { cargo_id: string }) => r.cargo_id));
      const quer = new Set(cargoIds);

      const sair = [...tinha].filter((id) => !quer.has(id));
      if (sair.length > 0) {
        const { error: delError } = await client
          .from("rol_membro_cargos")
          .delete()
          .eq("church_id", churchId)
          .eq("membro_id", membroId)
          .in("cargo_id", sair);
        if (delError) falha("Falha ao tirar cargo do membro", delError);
      }

      const entrar = [...quer].filter((id) => !tinha.has(id));
      if (entrar.length > 0) {
        const { error: insError } = await client
          .from("rol_membro_cargos")
          .insert(entrar.map((cargoId) => ({ membro_id: membroId, cargo_id: cargoId, church_id: churchId })));
        if (insError) {
          // 23505 = cargo de uma pessoa só (ex.: Pastor) já está com outro membro.
          if (insError.code === "23505") {
            throw new AppError("conflict", "Um dos cargos aceita uma pessoa só e já está com outro membro.", insError);
          }
          if (insError.code === "23514") {
            throw new AppError("validation_error", "Um dos cargos não está disponível para esta igreja.", insError);
          }
          falha("Falha ao dar cargo ao membro", insError);
        }
      }
    },

    async getMembro(churchId, membroId) {
      const { data, error } = await client
        .from("rol_membros")
        .select(MEMBRO_COLS)
        .eq("church_id", churchId)
        .eq("id", membroId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) falha("Falha ao carregar o membro", error);
      return data ? toMembro(data) : null;
    },

    async createMembro(churchId, m) {
      const { data, error } = await client
        .from("rol_membros")
        .insert({
          church_id: churchId,
          nome: m.nome,
          whatsapp: m.whatsapp,
          email: m.email,
          participa_chamada: m.participaChamada,
          membro_igreja: m.membroIgreja,
          nascimento: m.nascimento,
          ...(m.batismo !== undefined ? { batismo: m.batismo } : {}),
          ativo: m.ativo,
          observacoes: m.observacoes,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "Já existe um membro com esse e-mail.", error);
        falha("Falha ao cadastrar o membro", error);
      }
      return data.id;
    },

    async updateMembro(churchId, membroId, m) {
      const { data, error } = await client
        .from("rol_membros")
        .update({
          nome: m.nome,
          whatsapp: m.whatsapp,
          email: m.email,
          participa_chamada: m.participaChamada,
          membro_igreja: m.membroIgreja,
          nascimento: m.nascimento,
          ...(m.batismo !== undefined ? { batismo: m.batismo } : {}),
          ativo: m.ativo,
          observacoes: m.observacoes,
        })
        .eq("church_id", churchId)
        .eq("id", membroId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "Já existe um membro com esse e-mail.", error);
        falha("Falha ao salvar o membro", error);
      }
      return (data ?? []).length > 0;
    },

    // ------------------------------------------------- cultos (programação)
    async listCultos(churchId) {
      const { data, error } = await client
        .from("church_schedule")
        .select(CULTO_COLS)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .order("hora");
      if (error) falha("Falha ao carregar os cultos", error);
      return (data ?? []).map(toCulto);
    },

    async getCulto(churchId, cultoId) {
      // Sem filtro de deleted_at: culto que saiu da programação segue no histórico.
      const { data, error } = await client
        .from("church_schedule")
        .select(CULTO_COLS)
        .eq("church_id", churchId)
        .eq("id", cultoId)
        .maybeSingle();
      if (error) falha("Falha ao carregar o culto", error);
      return data ? toCulto(data) : null;
    },

    // ---------------------------------------------------------- chamada
    async getChamada(churchId, cultoId, data) {
      const { data: chamada, error } = await client
        .from("chamadas")
        .select("id, presencas:chamada_presencas(membro_id, estado, justificativa_id), visitantes:chamada_visitantes(nome, telefone)")
        .eq("church_id", churchId)
        .eq("schedule_id", cultoId)
        .eq("data", data)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) falha("Falha ao carregar a chamada", error);
      if (!chamada) return null;
      const row = chamada as unknown as {
        id: string;
        presencas: Array<{ membro_id: string; estado: Presenca["estado"]; justificativa_id: string | null }>;
        visitantes: Array<{ nome: string; telefone: string | null }>;
      };
      return {
        chamadaId: row.id,
        presencas: row.presencas.map((p) => ({
          membroId: p.membro_id,
          estado: p.estado,
          justificativaId: p.justificativa_id,
        })),
        visitantes: row.visitantes,
      };
    },

    async salvarChamada({ cultoId, data, presencas, visitantes }) {
      const { data: id, error } = await client.rpc("salvar_chamada", {
        p_schedule_id: cultoId,
        p_data: data,
        p_presencas: presencas.map((p) => ({
          membro_id: p.membroId,
          estado: p.estado,
          justificativa_id: p.justificativaId,
          motivo: p.motivo,
          motivo_texto: p.motivoTexto,
        })),
        p_visitantes: visitantes,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Culto não encontrado.", error);
        if (error.code === "23514") {
          throw new AppError("validation_error", "Este culto não aceita chamada nesta data. Confira na Programação.", error);
        }
        falha("Falha ao salvar a chamada", error);
      }
      return id as string;
    },

    // --------------------------------------------------- justificativas
    async listJustificativas(churchId, filtro) {
      let q = client
        .from("justificativas")
        .select(JUST_COLS)
        .eq("church_id", churchId)
        .is("deleted_at", null);
      if (filtro.fimAPartirDe) q = q.gte("data_fim", filtro.fimAPartirDe);
      if (filtro.membroId) q = q.eq("membro_id", filtro.membroId);
      const { data, error } = await q.order("data_inicio", { ascending: !filtro.membroId }).limit(500);
      if (error) falha("Falha ao carregar as justificativas", error);
      return (data ?? []).map(toJustificativa);
    },

    async getJustificativa(churchId, id) {
      const { data, error } = await client
        .from("justificativas")
        .select(JUST_COLS)
        .eq("church_id", churchId)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) falha("Falha ao carregar a justificativa", error);
      return data ? toJustificativa(data) : null;
    },

    async createJustificativa(churchId, j) {
      const { data, error } = await client
        .from("justificativas")
        .insert({
          church_id: churchId,
          membro_id: j.membroId,
          motivo: j.motivo,
          motivo_texto: j.motivoTexto,
          data_inicio: j.dataInicio,
          data_fim: j.dataFim,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) falha("Falha ao registrar a justificativa", error);
      return data.id;
    },

    async updateJustificativa(churchId, id, j) {
      const patch: Record<string, unknown> = {};
      if (j.motivo !== undefined) patch.motivo = j.motivo;
      if (j.motivoTexto !== undefined) patch.motivo_texto = j.motivoTexto;
      if (j.dataInicio !== undefined) patch.data_inicio = j.dataInicio;
      if (j.dataFim !== undefined) patch.data_fim = j.dataFim;
      if (j.encerradaEm !== undefined) patch.encerrada_em = j.encerradaEm;
      if (j.deletedAt !== undefined) patch.deleted_at = j.deletedAt;
      const { data, error } = await client
        .from("justificativas")
        .update(patch)
        .eq("church_id", churchId)
        .eq("id", id)
        .is("deleted_at", null)
        .select("id");
      if (error) falha("Falha ao salvar a justificativa", error);
      return (data ?? []).length > 0;
    },

    // --------------------------------------------------------- contatos
    async registrarContato(churchId, c) {
      const { error } = await client.from("acompanhamento_contatos").insert({
        church_id: churchId,
        membro_id: c.membroId,
        motivo: c.motivo,
        data: c.data,
        resultado: c.resultado,
        observacao: c.observacao,
      });
      if (error) falha("Falha ao registrar o contato", error);
    },

    async listContatos(churchId, membroId) {
      const { data, error } = await client
        .from("acompanhamento_contatos")
        .select("id, data, motivo, resultado, observacao")
        .eq("church_id", churchId)
        .eq("membro_id", membroId)
        .is("deleted_at", null)
        .order("data", { ascending: false })
        .limit(50);
      if (error) falha("Falha ao carregar os contatos", error);
      return (data ?? []) as ContatoRegistrado[];
    },

    // ----------------------------------------------------- cálculos SQL
    async alertas(churchId) {
      const rows = await rpc<Record<string, unknown>>("acompanhamento_alertas", { p_church_id: churchId }, "Falha ao calcular os alertas");
      return rows.map(
        (r): AlertaFaltas => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          whatsapp: r.whatsapp as string | null,
          faltasSeguidas: n(r.faltas_seguidas),
          ultimaPresenca: r.ultima_presenca as string | null,
          ultimaFalta: r.ultima_falta as string | null,
          contatoData: r.contato_data as string | null,
          contatoResultado: r.contato_resultado as AlertaFaltas["contatoResultado"],
          situacao: r.situacao as AlertaFaltas["situacao"],
        }),
      );
    },

    async justificativasLongas(churchId) {
      const rows = await rpc<Record<string, unknown>>(
        "acompanhamento_justificativas_longas",
        { p_church_id: churchId },
        "Falha ao calcular as justificativas longas",
      );
      return rows.map(
        (r): JustificativaLonga => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          whatsapp: r.whatsapp as string | null,
          cultosJustificados: n(r.cultos_justificados),
          desde: r.desde as string,
          dias: n(r.dias),
          ultimaPresenca: r.ultima_presenca as string | null,
          contatoData: r.contato_data as string | null,
          contatoResultado: r.contato_resultado as JustificativaLonga["contatoResultado"],
          situacao: r.situacao as JustificativaLonga["situacao"],
        }),
      );
    },

    async relatorioChamadas(churchId, de, ate) {
      const rows = await rpc<Record<string, unknown>>(
        "acompanhamento_relatorio_chamadas",
        { p_church_id: churchId, p_de: de, p_ate: ate },
        "Falha ao montar o relatório",
      );
      return rows.map(
        (r): RelatorioChamada => ({
          chamadaId: r.chamada_id as string,
          cultoId: r.schedule_id as string,
          cultoNome: r.culto_nome as string,
          data: r.data as string,
          presentes: n(r.presentes),
          justificados: n(r.justificados),
          ausentes: n(r.ausentes),
          visitantes: n(r.visitantes),
        }),
      );
    },

    async frequencia(churchId, de, ate) {
      const rows = await rpc<Record<string, unknown>>(
        "acompanhamento_frequencia",
        { p_church_id: churchId, p_de: de, p_ate: ate },
        "Falha ao calcular a frequência",
      );
      return rows.map(
        (r): FrequenciaMembro => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          ativo: Boolean(r.ativo),
          presentes: n(r.presentes),
          justificados: n(r.justificados),
          ausentes: n(r.ausentes),
          percentual: r.percentual === null ? null : Number(r.percentual),
        }),
      );
    },

    async historicoMembro(churchId, membroId) {
      const { data, error } = await client
        .from("acompanhamento_presencas_efetivas")
        .select("data, estado, schedule_id, momento")
        .eq("church_id", churchId)
        .eq("membro_id", membroId)
        .order("momento", { ascending: false })
        .limit(200);
      if (error) falha("Falha ao carregar o histórico", error);
      const rows = (data ?? []) as Array<{ data: string; estado: HistoricoMembroItem["estado"]; schedule_id: string }>;
      if (rows.length === 0) return [];
      const { data: cultos, error: cultosError } = await client
        .from("church_schedule")
        .select("id, titulo")
        .eq("church_id", churchId)
        .in("id", [...new Set(rows.map((r) => r.schedule_id))]);
      if (cultosError) falha("Falha ao carregar o histórico", cultosError);
      const nomes = new Map((cultos ?? []).map((c: { id: string; titulo: string }) => [c.id, c.titulo]));
      return rows.map((r) => ({ data: r.data, cultoNome: nomes.get(r.schedule_id) ?? "Culto", estado: r.estado }));
    },

    async resumo(churchId) {
      const [r] = await rpc<Record<string, unknown>>("acompanhamento_resumo", { p_church_id: churchId }, "Falha ao montar o resumo");
      return {
        ultimaChamadaData: (r?.ultima_chamada_data as string | null) ?? null,
        ultimoCultoNome: (r?.ultimo_culto_nome as string | null) ?? null,
        presentes: n(r?.presentes),
        justificados: n(r?.justificados),
        ausentes: n(r?.ausentes),
        visitantes: n(r?.visitantes),
        membrosAtivos: n(r?.membros_ativos),
        emAlerta: n(r?.em_alerta),
        justificativasLongas: n(r?.justificativas_longas),
        contatosPendentes: n(r?.contatos_pendentes),
      } satisfies ResumoAcompanhamento;
    },

    async resumoRede(churchId) {
      const rows = await rpc<Record<string, unknown>>(
        "acompanhamento_resumo_rede",
        { p_church_id: churchId },
        "Falha ao montar o resumo da rede",
      );
      return rows.map(
        (r): ResumoRedeIgreja => ({
          churchId: r.church_id as string,
          churchName: r.church_name as string,
          tipo: r.tipo as string,
          ultimaChamadaData: r.ultima_chamada_data as string | null,
          presentes: n(r.presentes),
          justificados: n(r.justificados),
          ausentes: n(r.ausentes),
          membrosAtivos: n(r.membros_ativos),
          emAlerta: n(r.em_alerta),
        }),
      );
    },

    // ---------------------------------------------------- configuração
    async getConfig(churchId) {
      const { data, error } = await client
        .from("acompanhamento_config")
        .select("faltas_alerta, justificativa_longa_cultos, justificativa_longa_dias")
        .eq("church_id", churchId)
        .maybeSingle();
      if (error) falha("Falha ao carregar as regras", error);
      const padrao: ConfigAcompanhamento = {
        faltasAlerta: 3,
        justificativaLongaCultos: 6,
        justificativaLongaDias: 45,
      };
      if (!data) return padrao;
      return {
        faltasAlerta: data.faltas_alerta,
        justificativaLongaCultos: data.justificativa_longa_cultos,
        justificativaLongaDias: data.justificativa_longa_dias,
      };
    },

    async saveConfig(churchId, c) {
      const valores = {
        faltas_alerta: c.faltasAlerta,
        justificativa_longa_cultos: c.justificativaLongaCultos,
        justificativa_longa_dias: c.justificativaLongaDias,
      };
      // Sem upsert: o client não tem GRANT de UPDATE em church_id.
      const { data, error } = await client
        .from("acompanhamento_config")
        .update({ ...valores, updated_at: new Date().toISOString() })
        .eq("church_id", churchId)
        .select("church_id");
      if (error) falha("Falha ao salvar as regras", error);
      if ((data ?? []).length > 0) return;
      const { error: insertError } = await client
        .from("acompanhamento_config")
        .insert({ church_id: churchId, ...valores });
      if (insertError) falha("Falha ao salvar as regras", insertError);
    },
  };
}
