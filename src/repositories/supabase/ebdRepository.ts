import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { EbdRepository } from "@/services/ebdService";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type {
  EbdProfessorDaIgreja,
  EbdAlerta,
  EbdAluno,
  EbdAulaResumo,
  EbdClasse,
  EbdFrequenciaAluno,
  EbdLicao,
  EbdPessoaBusca,
  EbdRedeIgreja,
  EbdRelatorioClasse,
  EbdResponsavel,
  EbdResumoClasse,
  EbdTrimestre,
} from "@/types/ebd";

/**
 * EBD sobre o client do usuário. Leituras de quem não lê o rol (professor,
 * secretaria) passam pelas funções ebd_* (security definer, conferem a
 * classe); a escrita de aula/presença/matrícula também. A RLS repete tudo.
 */

function falha(mensagem: string, error: unknown): never {
  throw new AppError("internal_error", mensagem, error);
}

/** Erros das funções do banco que viram mensagem para a pessoa. */
function erroDeNegocio(error: { code?: string; message?: string }, padrao: string): never {
  if (error.code === "P0002") throw new AppError("not_found", "Classe ou matrícula não encontrada.", error);
  if (error.code === "23505") throw new AppError("conflict", "Já existe uma classe com esse nome.", error);
  if (error.code === "23514") {
    throw new AppError("validation_error", "Dados não conferem com a classe (aluno ou pessoa de fora). Atualize a página.", error);
  }
  if (error.code === "42501") throw new AppError("forbidden", "Você não tem permissão para isso.", error);
  falha(padrao, error);
}

const n = (v: unknown) => Number(v ?? 0);

type LinhaLicao = { id: string; trimestre_id: string; numero: number; data: string; titulo: string | null };

/** Com títulos da classe: `titulo` é o da classe (ou null); sem, o geral. */
function paraLicao(l: LinhaLicao, daClasse: Map<string, string> | null): EbdLicao {
  return {
    id: l.id,
    trimestreId: l.trimestre_id,
    numero: l.numero,
    data: l.data,
    titulo: daClasse ? (daClasse.get(l.id) ?? null) : l.titulo,
    tituloGeral: l.titulo,
  };
}

export function createSupabaseEbdRepository(client: SupabaseClient): EbdRepository {
  async function titulosDaClasse(licaoIds: string[], classeId: string): Promise<Map<string, string>> {
    if (licaoIds.length === 0) return new Map();
    const { data, error } = await client
      .from("ebd_licao_titulos")
      .select("licao_id, titulo")
      .eq("classe_id", classeId)
      .in("licao_id", licaoIds);
    if (error) falha("Falha ao carregar os títulos da classe", error);
    return new Map(((data ?? []) as Array<{ licao_id: string; titulo: string }>).map((t) => [t.licao_id, t.titulo]));
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

    async listClasses(churchId) {
      const { data, error } = await client.rpc("ebd_classes_da_igreja", { p_church_id: churchId });
      if (error) falha("Falha ao carregar as classes", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdClasse => ({
          id: r.id as string,
          nome: r.nome as string,
          faixaEtaria: (r.faixa_etaria as string | null) ?? null,
          sala: (r.sala as string | null) ?? null,
          ordem: n(r.ordem),
          ativa: Boolean(r.ativa),
          idadeMinima: r.idade_minima === null || r.idade_minima === undefined ? null : n(r.idade_minima),
          idadeMaxima: r.idade_maxima === null || r.idade_maxima === undefined ? null : n(r.idade_maxima),
          matriculados: n(r.matriculados),
          professores: ((r.professores ?? []) as Array<{ membro_id: string; nome: string; tem_login: boolean }>).map((p) => ({
            membroId: p.membro_id,
            nome: p.nome,
            temLogin: p.tem_login,
          })),
        }),
      );
    },

    async criarClasse(churchId, c) {
      const { data, error } = await client
        .from("ebd_classes")
        .insert({
          church_id: churchId,
          nome: c.nome,
          faixa_etaria: c.faixaEtaria,
          sala: c.sala,
          ordem: c.ordem,
          idade_minima: c.idadeMinima,
          idade_maxima: c.idadeMaxima,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) erroDeNegocio(error, "Falha ao criar a classe");
      return data.id;
    },

    async editarClasse(churchId, classeId, c) {
      const patch: Record<string, unknown> = {};
      if (c.nome !== undefined) patch.nome = c.nome;
      if (c.faixaEtaria !== undefined) patch.faixa_etaria = c.faixaEtaria;
      if (c.sala !== undefined) patch.sala = c.sala;
      if (c.ordem !== undefined) patch.ordem = c.ordem;
      if (c.ativa !== undefined) patch.ativa = c.ativa;
      if (c.idadeMinima !== undefined) patch.idade_minima = c.idadeMinima;
      if (c.idadeMaxima !== undefined) patch.idade_maxima = c.idadeMaxima;
      const { data, error } = await client
        .from("ebd_classes")
        .update(patch)
        .eq("id", classeId)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .select("id");
      if (error) erroDeNegocio(error, "Falha ao salvar a classe");
      return (data ?? []).length > 0;
    },

    async adicionarProfessor(churchId, classeId, membroId) {
      const { error } = await client
        .from("ebd_professores")
        .upsert({ classe_id: classeId, membro_id: membroId, church_id: churchId }, { ignoreDuplicates: true });
      if (error) erroDeNegocio(error, "Falha ao definir o professor");
    },

    async removerProfessor(churchId, classeId, membroId) {
      const { error } = await client
        .from("ebd_professores")
        .delete()
        .eq("church_id", churchId)
        .eq("classe_id", classeId)
        .eq("membro_id", membroId);
      if (error) erroDeNegocio(error, "Falha ao tirar o professor");
    },

    async alunos(classeId, data) {
      const { data: rows, error } = await client.rpc("ebd_alunos_da_classe", { p_classe_id: classeId, p_data: data });
      if (error) falha("Falha ao carregar os alunos", error);
      return ((rows ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdAluno => ({
          membroId: r.membro_id as string,
          matriculaId: r.matricula_id as string,
          nome: r.nome as string,
          whatsapp: (r.whatsapp as string | null) ?? null,
          nascimento: (r.nascimento as string | null) ?? null,
          membroIgreja: Boolean(r.membro_igreja),
          desde: r.desde as string,
          cuidados: (r.cuidados as string | null) ?? null,
        }),
      );
    },

    async professores(churchId) {
      const { data, error } = await client.rpc("ebd_professores_da_igreja", { p_church_id: churchId });
      if (error) falha("Falha ao carregar os professores", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdProfessorDaIgreja => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          temCargo: Boolean(r.tem_cargo),
          temLogin: Boolean(r.tem_login),
          classes: (r.classes ?? []) as Array<{ id: string; nome: string }>,
        }),
      );
    },

    async darCargoProfessor(membroId) {
      const { error } = await client.rpc("ebd_dar_cargo_professor", { p_membro_id: membroId });
      if (!error) return;
      if (error.code === "P0002") throw new AppError("not_found", "Pessoa não encontrada.", error);
      if (error.code === "42501") {
        throw new AppError(
          "forbidden",
          "Nesta igreja o cargo Professor(a) da EBD libera outros menus: só o Responsável ou o Administrador pode dar.",
          error,
        );
      }
      falha("Falha ao dar o cargo", error);
    },

    async tirarCargoProfessor(membroId) {
      const { error } = await client.rpc("ebd_tirar_cargo_professor", { p_membro_id: membroId });
      if (!error) return;
      if (error.code === "P0002") throw new AppError("not_found", "Pessoa não encontrada.", error);
      if (error.code === "23514") {
        throw new AppError("validation_error", "Tire a pessoa das classes antes de tirar o cargo de professor.", error);
      }
      falha("Falha ao tirar o cargo", error);
    },

    async buscarPessoas(churchId, termo) {
      const { data, error } = await client.rpc("ebd_buscar_pessoas", {
        p_church_id: churchId,
        p_termo: termo
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase(),
      });
      if (error) falha("Falha ao buscar pessoas", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdPessoaBusca => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          membroIgreja: Boolean(r.membro_igreja),
          classeAtual: (r.classe_atual as string | null) ?? null,
        }),
      );
    },

    async matricular(classeId, membroId) {
      const { error } = await client.rpc("ebd_matricular", { p_classe_id: classeId, p_membro_id: membroId });
      if (error) erroDeNegocio(error, "Falha ao matricular");
    },

    async matricularNovo({ classeId, nome, telefone, nascimento, visitanteId }) {
      const { data, error } = await client.rpc("ebd_matricular_novo", {
        p_classe_id: classeId,
        p_nome: nome,
        p_telefone: telefone,
        p_nascimento: nascimento,
        p_visitante_id: visitanteId,
      });
      if (error) erroDeNegocio(error, "Falha ao matricular o aluno");
      return data as string;
    },

    async encerrarMatricula(matriculaId) {
      const { error } = await client.rpc("ebd_encerrar_matricula", { p_matricula_id: matriculaId });
      if (error) erroDeNegocio(error, "Falha ao tirar o aluno da classe");
    },

    async getAula(classeId, data) {
      const { data: aula, error } = await client
        .from("ebd_aulas")
        .select(
          "id, licao, biblias, revistas, oferta_centavos, presencas:ebd_presencas(membro_id, estado), visitantes:ebd_visitantes(id, nome, telefone, membro_id)",
        )
        .eq("classe_id", classeId)
        .eq("data", data)
        .maybeSingle();
      if (error) falha("Falha ao carregar a chamada", error);
      if (!aula) return null;
      const r = aula as unknown as {
        id: string;
        licao: string | null;
        biblias: number;
        revistas: number;
        oferta_centavos: number;
        presencas: Array<{ membro_id: string; estado: EstadoPresenca }>;
        visitantes: Array<{ id: string; nome: string; telefone: string | null; membro_id: string | null }>;
      };
      return {
        aulaId: r.id,
        licao: r.licao,
        biblias: r.biblias,
        revistas: r.revistas,
        ofertaCentavos: r.oferta_centavos,
        presencas: Object.fromEntries(r.presencas.map((p) => [p.membro_id, p.estado])),
        visitantes: r.visitantes.map((v) => ({ id: v.id, nome: v.nome, telefone: v.telefone, membroId: v.membro_id })),
      };
    },

    async salvarAula(a) {
      const { data, error } = await client.rpc("ebd_salvar_aula", {
        p_classe_id: a.classeId,
        p_data: a.data,
        p_licao: a.licao,
        p_biblias: a.biblias,
        p_revistas: a.revistas,
        p_oferta_centavos: a.ofertaCentavos,
        p_presencas: a.presencas.map((p) => ({ membro_id: p.membroId, estado: p.estado })),
        p_visitantes: a.visitantes.map((v) => ({ nome: v.nome, telefone: v.telefone, membro_id: v.membroId })),
      });
      if (error) erroDeNegocio(error, "Falha ao salvar a chamada");
      return data as string;
    },

    async aulasDaClasse(classeId) {
      const { data, error } = await client.rpc("ebd_aulas_da_classe", { p_classe_id: classeId, p_limite: 30 });
      if (error) falha("Falha ao carregar as aulas", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdAulaResumo => ({
          aulaId: r.aula_id as string,
          data: r.data as string,
          licao: (r.licao as string | null) ?? null,
          presentes: n(r.presentes),
          ausentes: n(r.ausentes),
          justificados: n(r.justificados),
          visitantes: n(r.visitantes),
          biblias: n(r.biblias),
          revistas: n(r.revistas),
          ofertaCentavos: n(r.oferta_centavos),
        }),
      );
    },

    async visitantesSemMatricula(classeId) {
      const { data, error } = await client
        .from("ebd_visitantes")
        .select("id, nome, telefone, aula:ebd_aulas(data)")
        .eq("classe_id", classeId)
        .is("membro_id", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) falha("Falha ao carregar os visitantes", error);
      return ((data ?? []) as unknown as Array<{
        id: string;
        nome: string;
        telefone: string | null;
        aula: { data: string } | Array<{ data: string }> | null;
      }>).map((v) => ({
        id: v.id,
        nome: v.nome,
        telefone: v.telefone,
        data: (Array.isArray(v.aula) ? v.aula[0]?.data : v.aula?.data) ?? "",
      }));
    },

    async resumoDoDia(churchId, data) {
      const { data: rows, error } = await client.rpc("ebd_resumo_do_dia", { p_church_id: churchId, p_data: data });
      if (error) falha("Falha ao montar o resumo do domingo", error);
      return ((rows ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdResumoClasse => ({
          classeId: r.classe_id as string,
          classeNome: r.classe_nome as string,
          matriculados: n(r.matriculados),
          chamadaFeita: Boolean(r.chamada_feita),
          presentes: n(r.presentes),
          ausentes: n(r.ausentes),
          justificados: n(r.justificados),
          visitantes: n(r.visitantes),
          biblias: n(r.biblias),
          revistas: n(r.revistas),
          ofertaCentavos: n(r.oferta_centavos),
          licao: (r.licao as string | null) ?? null,
        }),
      );
    },

    async alertas(churchId) {
      const { data, error } = await client.rpc("ebd_alertas", { p_church_id: churchId });
      if (error) falha("Falha ao calcular os alertas da EBD", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdAlerta => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          whatsapp: (r.whatsapp as string | null) ?? null,
          nascimento: (r.nascimento as string | null) ?? null,
          membroIgreja: Boolean(r.membro_igreja),
          classeId: r.classe_id as string,
          classeNome: r.classe_nome as string,
          faltasSeguidas: n(r.faltas_seguidas),
          ultimaPresenca: (r.ultima_presenca as string | null) ?? null,
          ultimaFalta: (r.ultima_falta as string | null) ?? null,
          contatoData: (r.contato_data as string | null) ?? null,
          contatoResultado: (r.contato_resultado as EbdAlerta["contatoResultado"]) ?? null,
          situacao: r.situacao as EbdAlerta["situacao"],
          responsavelNome: (r.responsavel_nome as string | null) ?? null,
          responsavelTelefone: (r.responsavel_telefone as string | null) ?? null,
        }),
      );
    },

    async registrarContato(churchId, c) {
      const { error } = await client.from("ebd_contatos").insert({
        church_id: churchId,
        membro_id: c.membroId,
        classe_id: c.classeId,
        data: c.data,
        resultado: c.resultado,
        observacao: c.observacao,
      });
      if (error) erroDeNegocio(error, "Falha ao registrar o contato");
    },

    async getFaltasAlerta(churchId) {
      const { data, error } = await client
        .from("ebd_config")
        .select("faltas_alerta")
        .eq("church_id", churchId)
        .maybeSingle<{ faltas_alerta: number }>();
      if (error) falha("Falha ao carregar as regras da EBD", error);
      return data?.faltas_alerta ?? 3;
    },

    async saveFaltasAlerta(churchId, faltas) {
      // Sem upsert: o client não tem GRANT de UPDATE em church_id.
      const { data, error } = await client
        .from("ebd_config")
        .update({ faltas_alerta: faltas, updated_at: new Date().toISOString() })
        .eq("church_id", churchId)
        .select("church_id");
      if (error) erroDeNegocio(error, "Falha ao salvar as regras da EBD");
      if ((data ?? []).length > 0) return;
      const { error: insertError } = await client.from("ebd_config").insert({ church_id: churchId, faltas_alerta: faltas });
      if (insertError) erroDeNegocio(insertError, "Falha ao salvar as regras da EBD");
    },

    async listTrimestres(churchId) {
      const { data, error } = await client
        .from("ebd_trimestres")
        .select("id, nome, inicio, fim, revista")
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .order("inicio", { ascending: false });
      if (error) falha("Falha ao carregar os trimestres", error);
      return (data ?? []) as EbdTrimestre[];
    },

    async salvarTrimestre(churchId, id, t) {
      const valores = { nome: t.nome, inicio: t.inicio, fim: t.fim, revista: t.revista };
      const { error } = id
        ? await client.from("ebd_trimestres").update(valores).eq("id", id).eq("church_id", churchId).is("deleted_at", null)
        : await client.from("ebd_trimestres").insert({ church_id: churchId, ...valores });
      if (error) erroDeNegocio(error, "Falha ao salvar o trimestre");
    },

    async removerTrimestre(churchId, id) {
      const { data, error } = await client
        .from("ebd_trimestres")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .select("id");
      if (error) erroDeNegocio(error, "Falha ao remover o trimestre");
      return (data ?? []).length > 0;
    },

    async relatorioClasses(churchId, de, ate) {
      const { data, error } = await client.rpc("ebd_relatorio_classes", { p_church_id: churchId, p_de: de, p_ate: ate });
      if (error) falha("Falha ao montar o relatório", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdRelatorioClasse => ({
          classeId: r.classe_id as string,
          classeNome: r.classe_nome as string,
          aulas: n(r.aulas),
          presentes: n(r.presentes),
          ausentes: n(r.ausentes),
          justificados: n(r.justificados),
          visitantes: n(r.visitantes),
          biblias: n(r.biblias),
          revistas: n(r.revistas),
          ofertaCentavos: n(r.oferta_centavos),
          matriculadosHoje: n(r.matriculados_hoje),
        }),
      );
    },

    async presencaPorDomingo(churchId, classeId, de, ate) {
      const { data, error } = await client.rpc("ebd_presenca_por_domingo", {
        p_church_id: churchId,
        p_classe_id: classeId,
        p_de: de,
        p_ate: ate,
      });
      if (error) falha("Falha ao montar a presença por domingo", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        data: r.data as string,
        presentes: n(r.presentes),
        ausentes: n(r.ausentes),
        justificados: n(r.justificados),
        visitantes: n(r.visitantes),
      }));
    },

    async frequenciaAlunos(churchId, classeId, de, ate) {
      const { data, error } = await client.rpc("ebd_frequencia_alunos", {
        p_church_id: churchId,
        p_classe_id: classeId,
        p_de: de,
        p_ate: ate,
      });
      if (error) falha("Falha ao calcular a frequência", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdFrequenciaAluno => ({
          membroId: r.membro_id as string,
          nome: r.nome as string,
          membroIgreja: Boolean(r.membro_igreja),
          classeId: r.classe_id as string,
          classeNome: r.classe_nome as string,
          matriculadoHoje: Boolean(r.matriculado_hoje),
          presentes: n(r.presentes),
          ausentes: n(r.ausentes),
          justificados: n(r.justificados),
          percentual: r.percentual === null || r.percentual === undefined ? null : Number(r.percentual),
        }),
      );
    },

    async responsaveis(membroIds) {
      const { data, error } = await client.rpc("ebd_responsaveis", { p_membro_ids: membroIds });
      if (error) falha("Falha ao carregar os responsáveis", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdResponsavel => ({
          id: r.id as string,
          membroId: r.membro_id as string,
          responsavelId: (r.responsavel_id as string | null) ?? null,
          nome: r.nome as string,
          telefone: (r.telefone as string | null) ?? null,
          parentesco: r.parentesco as string,
          podeBuscar: Boolean(r.pode_buscar),
        }),
      );
    },

    async salvarResponsavel(r) {
      const { error } = await client.rpc("ebd_salvar_responsavel", {
        p_id: r.id,
        p_membro_id: r.membroId,
        p_responsavel_id: r.responsavelId,
        p_nome: r.nome,
        p_telefone: r.telefone,
        p_parentesco: r.parentesco,
        p_pode_buscar: r.podeBuscar,
      });
      if (error) erroDeNegocio(error, "Falha ao salvar o responsável");
    },

    async removerResponsavel(id) {
      const { error } = await client.rpc("ebd_remover_responsavel", { p_id: id });
      if (error) erroDeNegocio(error, "Falha ao remover o responsável");
    },

    async salvarCuidados(membroId, texto) {
      const { error } = await client.rpc("ebd_salvar_cuidados", { p_membro_id: membroId, p_texto: texto });
      if (error) erroDeNegocio(error, "Falha ao salvar os cuidados");
    },

    async promover(churchId, data, itens) {
      const { data: n, error } = await client.rpc("ebd_promover", {
        p_church_id: churchId,
        p_data: data,
        p_itens: itens.map((i) => ({ membro_id: i.membroId, classe_id: i.classeId })),
      });
      if (error) erroDeNegocio(error, "Falha ao promover os alunos");
      return Number(n ?? 0);
    },

    async licoes(churchId, trimestreId, classeId) {
      const { data, error } = await client
        .from("ebd_licoes")
        .select("id, trimestre_id, numero, data, titulo")
        .eq("church_id", churchId)
        .eq("trimestre_id", trimestreId)
        .order("numero");
      if (error) falha("Falha ao carregar as lições", error);
      const linhas = (data ?? []) as LinhaLicao[];
      const daClasse = classeId ? await titulosDaClasse(linhas.map((l) => l.id), classeId) : null;
      return linhas.map((l) => paraLicao(l, daClasse));
    },

    async criarLicoes(churchId, trimestreId, licoes) {
      const { error } = await client
        .from("ebd_licoes")
        .insert(licoes.map((l) => ({ church_id: churchId, trimestre_id: trimestreId, numero: l.numero, data: l.data })));
      if (error) erroDeNegocio(error, "Falha ao criar as lições");
    },

    async salvarTituloLicao(churchId, licaoId, titulo, classeId) {
      if (classeId) {
        // Título só da classe: vazio apaga e a classe volta a usar o geral.
        if (!titulo) {
          const { error } = await client
            .from("ebd_licao_titulos")
            .delete()
            .eq("licao_id", licaoId)
            .eq("classe_id", classeId)
            .eq("church_id", churchId);
          if (error) erroDeNegocio(error, "Falha ao salvar a lição");
          return true;
        }
        // Sem upsert: o client só tem GRANT de UPDATE no título, e o upsert
        // tentaria atualizar as outras colunas também.
        const { data: atualizado, error: updateError } = await client
          .from("ebd_licao_titulos")
          .update({ titulo })
          .eq("licao_id", licaoId)
          .eq("classe_id", classeId)
          .eq("church_id", churchId)
          .select("licao_id");
        if (updateError) erroDeNegocio(updateError, "Falha ao salvar a lição");
        if ((atualizado ?? []).length > 0) return true;
        const { error } = await client
          .from("ebd_licao_titulos")
          .insert({ licao_id: licaoId, classe_id: classeId, church_id: churchId, titulo });
        if (error) erroDeNegocio(error, "Falha ao salvar a lição");
        return true;
      }
      const { data, error } = await client
        .from("ebd_licoes")
        .update({ titulo })
        .eq("id", licaoId)
        .eq("church_id", churchId)
        .select("id");
      if (error) erroDeNegocio(error, "Falha ao salvar a lição");
      return (data ?? []).length > 0;
    },

    async licaoDoDia(churchId, data, classeId) {
      const { data: l, error } = await client
        .from("ebd_licoes")
        .select("id, trimestre_id, numero, data, titulo")
        .eq("church_id", churchId)
        .eq("data", data)
        .limit(1)
        .maybeSingle<LinhaLicao>();
      if (error) falha("Falha ao carregar a lição do dia", error);
      if (!l) return null;
      return paraLicao(l, classeId ? await titulosDaClasse([l.id], classeId) : null);
    },

    async resumoRede(churchId) {
      const { data, error } = await client.rpc("ebd_resumo_rede", { p_church_id: churchId });
      if (error) falha("Falha ao montar o resumo da rede", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): EbdRedeIgreja => ({
          churchId: r.church_id as string,
          churchName: r.church_name as string,
          tipo: r.tipo as string,
          classes: n(r.classes),
          matriculados: n(r.matriculados),
          ultimoDomingo: (r.ultimo_domingo as string | null) ?? null,
          presentesUltimo: n(r.presentes_ultimo),
          visitantesUltimo: n(r.visitantes_ultimo),
          presenca8Semanas: r.presenca_8_semanas === null || r.presenca_8_semanas === undefined ? null : Number(r.presenca_8_semanas),
        }),
      );
    },

    async resumoDoMembro(membroId) {
      const { data, error } = await client.rpc("ebd_resumo_do_membro", { p_membro_id: membroId });
      if (error) falha("Falha ao carregar a EBD do membro", error);
      const r = ((data ?? []) as Array<Record<string, unknown>>)[0];
      if (!r) return null;
      return {
        classeAtual: (r.classe_atual as string | null) ?? null,
        desde: (r.desde as string | null) ?? null,
        presencas: n(r.presencas),
        ausencias: n(r.ausencias),
        justificados: n(r.justificados),
        ultimaPresenca: (r.ultima_presenca as string | null) ?? null,
        classesAnteriores: (r.classes_anteriores as string | null) ?? null,
      };
    },
  };
}
