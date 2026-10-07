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
  Aniversario,
  FichaMembro,
  ResumoRedeIgreja,
  RolMembro,
} from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";

/**
 * Chamada e Acompanhamento sobre o client do usuário: a RLS só abre a
 * própria igreja para quem pode acompanhar (`can_acompanhar`). O filtro por
 * church_id é repetido em toda consulta, como manda o CLAUDE.md.
 */

// Só o que quem faz a chamada pode ler. E-mail, nascimento, batismo,
// observações e cuidados são RESERVADOS: saem da visão `rol_membros_reservado`,
// que só responde a quem tem o módulo Membros (migration 20261006200000).
const MEMBRO_COLS =
  "id, church_id, nome, whatsapp, user_id, participa_chamada, membro_igreja, ativo, situacao, " +
  "cargos:rol_membro_cargos(cargo:cargos(id, nome, ordem, deleted_at))";
const RESERVADO_COLS = "id, email, nascimento, batismo, observacoes, cuidados";

interface Reservado {
  id: string;
  email: string | null;
  nascimento: string | null;
  batismo: string | null;
  observacoes: string | null;
  cuidados: string | null;
}
const FICHA_COLS =
  "sexo, estado_civil, naturalidade, profissao, conjuge_nome, data_casamento, pai_nome, mae_nome, filhos, " +
  "cep, logradouro, numero, complemento, bairro, cidade, uf, data_conversao, entrada_forma, membro_desde, " +
  "igreja_origem, situacao, situacao_em, situacao_motivo";
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
  // Os cinco reservados entram depois, por `comReservados`; sem o módulo
  // Membros ficam em branco.
  email: null,
  userId: r.user_id,
  participaChamada: r.participa_chamada,
  membroIgreja: r.membro_igreja,
  cuidados: null,
  nascimento: null,
  batismo: null,
  ativo: r.ativo,
  situacao: r.situacao ?? (r.ativo ? "ativo" : "afastado"),
  observacoes: null,
});

const toFicha = (r: any): FichaMembro => ({
  sexo: r.sexo,
  estadoCivil: r.estado_civil,
  naturalidade: r.naturalidade,
  profissao: r.profissao,
  conjugeNome: r.conjuge_nome,
  dataCasamento: r.data_casamento,
  paiNome: r.pai_nome,
  maeNome: r.mae_nome,
  filhos: r.filhos,
  cep: r.cep,
  logradouro: r.logradouro,
  numero: r.numero,
  complemento: r.complemento,
  bairro: r.bairro,
  cidade: r.cidade,
  uf: r.uf,
  dataConversao: r.data_conversao,
  entradaForma: r.entrada_forma,
  membroDesde: r.membro_desde,
  igrejaOrigem: r.igreja_origem,
  situacao: r.situacao,
  situacaoEm: r.situacao_em,
  situacaoMotivo: r.situacao_motivo,
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

  /**
   * Dados reservados dos membros pedidos, por id. Em blocos, para o filtro
   * `in` não virar uma URL enorme. Quem não tem o módulo Membros recebe um
   * mapa vazio (a visão não devolve linha), e não um erro.
   */
  async function reservadosDe(ids: string[]): Promise<Map<string, Reservado>> {
    const mapa = new Map<string, Reservado>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await client
        .from("rol_membros_reservado")
        .select(RESERVADO_COLS)
        .in("id", ids.slice(i, i + 200));
      if (error) falha("Falha ao carregar os dados dos membros", error);
      for (const r of (data ?? []) as Reservado[]) mapa.set(r.id, r);
    }
    return mapa;
  }

  /** Junta os reservados aos membros já carregados. */
  async function comReservados(membros: RolMembro[]): Promise<RolMembro[]> {
    if (membros.length === 0) return membros;
    const reservados = await reservadosDe(membros.map((m) => m.id));
    return membros.map((m) => {
      const r = reservados.get(m.id);
      return r
        ? { ...m, email: r.email, nascimento: r.nascimento, batismo: r.batismo, observacoes: r.observacoes, cuidados: r.cuidados }
        : m;
    });
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
      return comReservados((data ?? []).map(toMembro));
    },

    async listMembrosPagina(churchId, { busca, situacao, cargoId, membroIgreja, limit, offset }) {
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
      if (situacao) q = q.eq("situacao", situacao);
      if (membroIgreja !== undefined) q = q.eq("membro_igreja", membroIgreja);
      if (comCargo) q = q.in("id", comCargo);
      // % e _ do termo são literais, não curingas do LIKE.
      if (busca) q = q.ilike("nome_busca", `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await q.order("nome").range(offset, offset + limit - 1);
      if (error) falha("Falha ao carregar os membros", error);
      return { items: await comReservados((data ?? []).map(toMembro)), total: count ?? 0 };
    },

    async listAcessos(companyId) {
      const [membros, convites] = await Promise.all([
        client
          .from("company_members")
          .select("id, user_id, role")
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
          }): AcessoMembro => ({
            companyMemberId: r.id,
            userId: r.user_id,
            role: r.role,
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
      // Pela visão dos reservados (o e-mail não é lido direto na tabela).
      const { data, error } = await client
        .from("rol_membros_reservado")
        .select("email")
        .eq("church_id", churchId)
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
      return data ? ((await comReservados([toMembro(data)]))[0] ?? null) : null;
    },

    async createMembros(churchId, membros) {
      let criados = 0;
      // Em lotes: uma planilha grande não vira um pedido gigante.
      for (let i = 0; i < membros.length; i += 200) {
        const lote = membros.slice(i, i + 200).map((m) => ({
          church_id: churchId,
          nome: m.nome,
          whatsapp: m.whatsapp,
          email: m.email,
          participa_chamada: m.participaChamada,
          membro_igreja: m.membroIgreja,
          nascimento: m.nascimento,
          batismo: m.batismo ?? null,
          ativo: m.ativo,
          observacoes: m.observacoes,
        }));
        const { data, error } = await client.from("rol_membros").insert(lote).select("id");
        if (error) {
          if (error.code === "23505") {
            throw new AppError(
              "conflict",
              `Um e-mail da planilha já está em uso por outro membro. ${criados} membro(s) entraram antes do erro.`,
              error,
            );
          }
          falha(`Falha ao importar os membros (${criados} entraram antes do erro)`, error);
        }
        criados += data?.length ?? 0;
      }
      return criados;
    },

    async listPessoasDoRol(churchId) {
      const todos: Array<{ nome: string; nascimento: string | null; email: string | null }> = [];
      // O PostgREST devolve no máximo 1000 linhas por pedido: pagina até acabar.
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await client
          .from("rol_membros")
          .select("id, nome")
          .eq("church_id", churchId)
          .is("deleted_at", null)
          .order("id")
          .range(inicio, inicio + 999);
        if (error) falha("Falha ao carregar os membros da igreja", error);
        const pagina = (data ?? []) as Array<{ id: string; nome: string }>;
        // Nascimento e e-mail são reservados: vêm da visão (a importação é do módulo Membros).
        const reservados = await reservadosDe(pagina.map((m) => m.id));
        todos.push(
          ...pagina.map((m) => ({
            nome: m.nome,
            nascimento: reservados.get(m.id)?.nascimento ?? null,
            email: reservados.get(m.id)?.email ?? null,
          })),
        );
        if (pagina.length < 1000) return todos;
      }
    },

    async listFichas(churchId) {
      const fichas: Record<string, FichaMembro> = {};
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await client
          .from("rol_membro_fichas")
          .select(`membro_id, ${FICHA_COLS}`)
          .eq("church_id", churchId)
          .is("deleted_at", null)
          .order("membro_id")
          .range(inicio, inicio + 999);
        if (error) falha("Falha ao carregar as fichas dos membros", error);
        for (const r of (data ?? []) as unknown as Array<{ membro_id: string }>) fichas[r.membro_id] = toFicha(r);
        if (!data || data.length < 1000) return fichas;
      }
    },

    async aniversariantes(churchId, mes) {
      const { data, error } = await client.rpc("aniversariantes_do_mes", { p_church_id: churchId, p_mes: mes });
      if (error) falha("Falha ao carregar os aniversariantes", error);
      type Linha = {
        membro_id: string;
        nome: string;
        whatsapp: string | null;
        tipo: Aniversario["tipo"];
        data: string;
        conjuge_nome: string | null;
      };
      return ((data ?? []) as Linha[]).map((r) => ({
        membroId: r.membro_id,
        nome: r.nome,
        whatsapp: r.whatsapp,
        tipo: r.tipo,
        data: r.data,
        dia: Number(String(r.data).slice(8, 10)),
        conjugeNome: r.conjuge_nome,
      }));
    },

    async getFicha(churchId, membroId) {
      const { data, error } = await client
        .from("rol_membro_fichas")
        .select(FICHA_COLS)
        .eq("church_id", churchId)
        .eq("membro_id", membroId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) falha("Falha ao carregar a ficha do membro", error);
      return data ? toFicha(data) : null;
    },

    async salvarFicha(membroId, f) {
      const { error } = await client.rpc("salvar_ficha_membro", {
        p_membro_id: membroId,
        p_ficha: {
          sexo: f.sexo,
          estado_civil: f.estadoCivil,
          naturalidade: f.naturalidade,
          profissao: f.profissao,
          conjuge_nome: f.conjugeNome,
          data_casamento: f.dataCasamento,
          pai_nome: f.paiNome,
          mae_nome: f.maeNome,
          filhos: f.filhos,
          cep: f.cep,
          logradouro: f.logradouro,
          numero: f.numero,
          complemento: f.complemento,
          bairro: f.bairro,
          cidade: f.cidade,
          uf: f.uf,
          data_conversao: f.dataConversao,
          entrada_forma: f.entradaForma,
          membro_desde: f.membroDesde,
          igreja_origem: f.igrejaOrigem,
          situacao: f.situacao,
          situacao_em: f.situacaoEm,
          situacao_motivo: f.situacaoMotivo,
        },
      });
      if (error) {
        if (error.code === "P0002") {
          throw new AppError("not_found", "Membro não encontrado, ou você não tem acesso à ficha dele.", error);
        }
        // CHECK da tabela ou data impossível: o service já validou, então é dado adulterado.
        if (error.code === "23514" || error.code?.startsWith("22")) {
          throw new AppError("validation_error", "Confira os dados da ficha.", error);
        }
        falha("Falha ao salvar a ficha do membro", error);
      }
    },

    async excluirMembro(membroId) {
      const { error } = await client.rpc("excluir_membro", { p_membro_id: membroId });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado.", error);
        if (error.code === "23514") {
          throw new AppError("conflict", "Este membro tem acesso ao sistema. Remova o acesso antes de excluir.", error);
        }
        falha("Falha ao excluir o membro", error);
      }
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
