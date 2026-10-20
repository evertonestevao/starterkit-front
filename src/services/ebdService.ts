import { z } from "zod";
import { hojeISO, somarDias } from "@/lib/acompanhamento";
import { domingosEntre, textoDaLicao } from "@/lib/ebd";
import { AppError, toValidationError } from "@/lib/errors";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { RoleCode } from "@/types/database";
import type {
  EbdAlerta,
  EbdProfessorDaIgreja,
  EbdHistoricoDoAluno,
  EbdAluno,
  EbdAlunoDaIgreja,
  EbdAulaParaPreencher,
  EbdAulaResumo,
  EbdClasse,
  EbdFrequenciaAluno,
  EbdLicao,
  EbdPessoaBusca,
  EbdPresencaDomingo,
  EbdPromocaoLinha,
  EbdRedeIgreja,
  EbdRelatorioClasse,
  EbdResponsavel,
  EbdResumoClasse,
  EbdResumoMembro,
  EbdTrimestre,
  EbdVisitante,
} from "@/types/ebd";

/**
 * EBD — Escola Bíblica Dominical.
 *
 * Quem usa:
 *  - gestão (owner/admin e a secretaria da EBD, `pode_gerir_ebd`): todas as
 *    classes; cria classes, define professores, matricula quem já está no rol;
 *  - professor (membro com login, cadastrado na classe): só as classes dele;
 *    faz a chamada, registra visitantes e matricula aluno novo.
 * O banco confere tudo de novo (can_gerir_ebd / can_ebd_classe); aqui a
 * checagem existe para a mensagem sair clara e cedo.
 */

export interface EbdActor {
  companyId: string;
  role: RoleCode;
  podeGerirEbd: boolean;
  /** Professor de alguma classe nesta empresa. */
  professorEbd: boolean;
}

export function canGerirEbd(role: RoleCode, podeGerirEbd: boolean): boolean {
  return role === "owner" || role === "admin" || podeGerirEbd;
}

export function canAcessarEbd(actor: Pick<EbdActor, "role" | "podeGerirEbd" | "professorEbd">): boolean {
  return canGerirEbd(actor.role, actor.podeGerirEbd) || actor.professorEbd;
}

export interface EbdRepository {
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  listClasses(churchId: string): Promise<EbdClasse[]>;
  criarClasse(churchId: string, input: NovaClasse): Promise<string>;
  editarClasse(churchId: string, classeId: string, input: Partial<NovaClasse> & { ativa?: boolean }): Promise<boolean>;
  adicionarProfessor(churchId: string, classeId: string, membroId: string): Promise<void>;
  removerProfessor(churchId: string, classeId: string, membroId: string): Promise<void>;
  alunos(classeId: string, data: string): Promise<EbdAluno[]>;
  buscarPessoas(churchId: string, termo: string): Promise<EbdPessoaBusca[]>;
  professores(churchId: string): Promise<EbdProfessorDaIgreja[]>;
  /** null = aluno não existe ou quem pede não enxerga nenhuma classe dele. */
  historicoDoAluno(membroId: string): Promise<EbdHistoricoDoAluno | null>;
  editarAluno(membroId: string, dados: { nome: string; telefone: string | null; nascimento: string | null }): Promise<void>;
  darCargoProfessor(membroId: string): Promise<void>;
  tirarCargoProfessor(membroId: string): Promise<void>;
  matricular(classeId: string, membroId: string): Promise<void>;
  matricularNovo(input: {
    classeId: string;
    nome: string;
    telefone: string | null;
    nascimento: string | null;
    visitanteId: string | null;
  }): Promise<string>;
  encerrarMatricula(matriculaId: string): Promise<void>;
  getAula(
    classeId: string,
    data: string,
  ): Promise<{
    aulaId: string;
    licao: string | null;
    biblias: number;
    revistas: number;
    ofertaCentavos: number;
    presencas: Record<string, EstadoPresenca>;
    visitantes: EbdVisitante[];
  } | null>;
  salvarAula(input: {
    classeId: string;
    data: string;
    licao: string | null;
    biblias: number;
    revistas: number;
    ofertaCentavos: number;
    presencas: Array<{ membroId: string; estado: EstadoPresenca }>;
    visitantes: Array<{ nome: string; telefone: string | null; membroId: string | null }>;
  }): Promise<string>;
  aulasDaClasse(classeId: string): Promise<EbdAulaResumo[]>;
  visitantesSemMatricula(
    classeId: string,
  ): Promise<Array<{ id: string; nome: string; telefone: string | null; data: string }>>;
  resumoDoDia(churchId: string, data: string): Promise<EbdResumoClasse[]>;
  resumoDoMembro(membroId: string): Promise<EbdResumoMembro | null>;

  alertas(churchId: string): Promise<EbdAlerta[]>;
  registrarContato(
    churchId: string,
    input: { membroId: string; classeId: string; data: string; resultado: string; observacao: string | null },
  ): Promise<void>;
  getFaltasAlerta(churchId: string): Promise<number>;
  saveFaltasAlerta(churchId: string, faltas: number): Promise<void>;
  listTrimestres(churchId: string): Promise<EbdTrimestre[]>;
  salvarTrimestre(churchId: string, id: string | null, input: Omit<EbdTrimestre, "id">): Promise<void>;
  removerTrimestre(churchId: string, id: string): Promise<boolean>;
  relatorioClasses(churchId: string, de: string, ate: string): Promise<EbdRelatorioClasse[]>;
  /** Presença somada por data de aula, no período (classeId null = todas as que a pessoa vê). */
  presencaPorDomingo(churchId: string, classeId: string | null, de: string, ate: string): Promise<EbdPresencaDomingo[]>;
  frequenciaAlunos(churchId: string, classeId: string | null, de: string, ate: string): Promise<EbdFrequenciaAluno[]>;

  responsaveis(membroIds: string[]): Promise<EbdResponsavel[]>;
  salvarResponsavel(input: {
    id: string | null;
    membroId: string;
    responsavelId: string | null;
    nome: string | null;
    telefone: string | null;
    parentesco: string;
    podeBuscar: boolean;
  }): Promise<void>;
  removerResponsavel(id: string): Promise<void>;
  salvarCuidados(membroId: string, texto: string | null): Promise<void>;
  promover(churchId: string, data: string, itens: Array<{ membroId: string; classeId: string }>): Promise<number>;
  /** Com `classeId`, `titulo` é o da classe (revista dela); sem, o geral. */
  licoes(churchId: string, trimestreId: string, classeId?: string | null): Promise<EbdLicao[]>;
  criarLicoes(churchId: string, trimestreId: string, licoes: Array<{ numero: number; data: string }>): Promise<void>;
  /** Com `classeId`, grava (ou apaga, se vazio) o título só daquela classe. */
  salvarTituloLicao(
    churchId: string,
    licaoId: string,
    titulo: string | null,
    classeId?: string | null,
  ): Promise<boolean>;
  licaoDoDia(churchId: string, data: string, classeId?: string | null): Promise<EbdLicao | null>;
  resumoRede(churchId: string): Promise<EbdRedeIgreja[]>;
}

export interface NovaClasse {
  nome: string;
  faixaEtaria: string | null;
  sala: string | null;
  ordem: number;
  idadeMinima: number | null;
  idadeMaxima: number | null;
}

const vazioVira = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

const dataISO = z.iso.date("Data inválida");

const idade = vazioVira(z.coerce.number().int("Idade em anos").min(0).max(120));

const classeSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da classe").max(60, "Nome longo demais"),
    faixaEtaria: vazioVira(z.string().trim().max(40, "Faixa etária longa demais")),
    sala: vazioVira(z.string().trim().max(40, "Sala longa demais")),
    ordem: z.number().int().min(0).max(999).default(100),
    idadeMinima: idade.default(null),
    idadeMaxima: idade.default(null),
  })
  .refine((v) => v.idadeMinima === null || v.idadeMaxima === null || v.idadeMaxima >= v.idadeMinima, {
    message: "A idade máxima vem depois da mínima",
    path: ["idadeMaxima"],
  });

const responsavelSchema = z
  .object({
    id: vazioVira(z.uuid()),
    membroId: z.uuid("Aluno inválido"),
    responsavelId: vazioVira(z.uuid()),
    nome: vazioVira(z.string().trim().min(2, "Informe o nome do responsável").max(120)),
    telefone: vazioVira(z.string().trim().min(8, "Telefone inválido").max(20, "Telefone inválido")),
    parentesco: z.string().trim().min(2, "Informe o parentesco").max(30, "Parentesco longo demais"),
    podeBuscar: z.boolean().default(true),
  })
  .refine((v) => v.responsavelId || v.nome, { message: "Escolha alguém de Membros ou informe o nome", path: ["nome"] });

const promocaoSchema = z.object({
  data: dataISO,
  itens: z
    .array(z.object({ membroId: z.uuid(), classeId: z.uuid() }))
    .min(1, "Escolha ao menos um aluno")
    .max(500),
});

const novoAlunoSchema = z.object({
  classeId: z.uuid("Classe inválida"),
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Nome longo demais"),
  telefone: vazioVira(z.string().trim().min(8, "Telefone inválido").max(20, "Telefone inválido")),
  nascimento: vazioVira(dataISO),
  visitanteId: vazioVira(z.uuid()),
});

const aulaSchema = z.object({
  classeId: z.uuid("Classe inválida"),
  data: dataISO,
  licao: vazioVira(z.string().trim().max(200, "Lição longa demais")),
  biblias: z.number().int().min(0, "Não pode ser negativo").max(999),
  revistas: z.number().int().min(0, "Não pode ser negativo").max(999),
  ofertaCentavos: z.number().int().min(0, "Oferta inválida").max(100_000_000, "Oferta alta demais"),
  presencas: z.array(z.object({ membroId: z.uuid(), estado: z.enum(["presente", "ausente", "justificado"]) })).max(500),
  visitantes: z
    .array(
      z.object({
        nome: z.string().trim().min(2, "Nome do visitante muito curto").max(120),
        telefone: vazioVira(z.string().trim().min(8, "Telefone do visitante inválido").max(20)),
        membroId: vazioVira(z.uuid()),
      }),
    )
    .max(100),
});

const contatoSchema = z.object({
  membroId: z.uuid("Aluno inválido"),
  classeId: z.uuid("Classe inválida"),
  data: dataISO,
  resultado: z.enum(["retornou", "em_acompanhamento", "mudou_de_cidade", "outro"], "Escolha o resultado"),
  observacao: vazioVira(z.string().trim().max(1000, "Observação longa demais")),
});

const trimestreSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome (ex.: 4º trimestre de 2026)").max(60, "Nome longo demais"),
    inicio: dataISO,
    fim: dataISO,
    revista: vazioVira(z.string().trim().max(120, "Nome da revista longo demais")),
  })
  .refine((v) => v.fim >= v.inicio, { message: "O fim vem depois do início", path: ["fim"] })
  .refine((v) => (Date.parse(v.fim) - Date.parse(v.inicio)) / 86_400_000 <= 200, {
    message: "Um trimestre tem até uns 3 meses",
    path: ["fim"],
  });

const periodoSchema = z
  .object({ de: dataISO, ate: dataISO })
  .refine((v) => v.ate >= v.de, { message: "Período inválido", path: ["ate"] })
  .refine((v) => (Date.parse(v.ate) - Date.parse(v.de)) / 86_400_000 <= 731, {
    message: "Escolha um período de até dois anos",
    path: ["ate"],
  });

function validar<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw toValidationError(parsed.error.issues);
  return parsed.data;
}

const editarAlunoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Nome longo demais"),
  telefone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone com DDD, por favor")
    .transform((v) => v || null),
  nascimento: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data de nascimento inválida")
    .transform((v) => v || null),
});

/** Janela da frequência na lista de alunos. */
export const DIAS_DA_FREQUENCIA = 90;

export function createEbdService(deps: { repo: EbdRepository; hoje?: () => string }) {
  const { repo } = deps;
  const hoje = deps.hoje ?? (() => hojeISO());

  async function igreja(actor: EbdActor) {
    if (!canAcessarEbd(actor)) throw new AppError("forbidden", "Você não tem acesso à EBD desta igreja.");
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Esta conta ainda não tem uma igreja cadastrada.");
    return church;
  }

  async function gestao(actor: EbdActor) {
    if (!canGerirEbd(actor.role, actor.podeGerirEbd)) {
      throw new AppError("forbidden", "Só a secretaria da EBD e quem administra a igreja podem fazer isso.");
    }
    return igreja(actor);
  }

  /** A classe está entre as que a pessoa enxerga (a RLS já filtrou). */
  async function exigeClasse(churchId: string, classeId: string) {
    if (!z.uuid().safeParse(classeId).success) throw new AppError("validation_error", "Classe inválida.");
    const classe = (await repo.listClasses(churchId)).find((c) => c.id === classeId);
    if (!classe) throw new AppError("not_found", "Classe não encontrada.");
    return classe;
  }

  return {
    async classes(actor: EbdActor) {
      const church = await igreja(actor);
      return {
        igreja: church,
        classes: await repo.listClasses(church.id),
        gestao: canGerirEbd(actor.role, actor.podeGerirEbd),
      };
    },

    /**
     * Todos os alunos matriculados hoje, com a classe de cada um, por nome.
     * `listClasses` já devolve só as classes que a pessoa pode ver (o
     * professor recebe as dele), então a lista segue o mesmo recorte.
     */
    async alunosDaIgreja(
      actor: EbdActor,
    ): Promise<{
      alunos: EbdAlunoDaIgreja[];
      classes: EbdClasse[];
      gestao: boolean;
      /** De quando a quando a frequência foi contada. */
      periodo: { de: string; ate: string };
    }> {
      const church = await igreja(actor);
      const classes = (await repo.listClasses(church.id)).filter((c) => c.ativa);
      const hojeData = hoje();
      // Frequência nos últimos 90 dias: no começo de um trimestre, contar só
      // ele daria 0%, 50% ou 100% com uma ou duas aulas.
      const periodo = { de: somarDias(hojeData, -DIAS_DA_FREQUENCIA), ate: hojeData };
      const [porClasse, frequencias] = await Promise.all([
        Promise.all(classes.map(async (c) => ({ classe: c, alunos: await repo.alunos(c.id, hojeData) }))),
        // Complemento: se falhar, a lista sai sem a frequência.
        repo.frequenciaAlunos(church.id, null, periodo.de, periodo.ate).catch(() => []),
      ]);
      const frequenciaDe = new Map(frequencias.map((f) => [`${f.membroId}|${f.classeId}`, f]));
      const professores = new Set(classes.flatMap((c) => c.professores.map((p) => p.membroId)));
      const alunos = porClasse
        .flatMap(({ classe, alunos: lista }) =>
          lista.map((a): EbdAlunoDaIgreja => {
            const f = frequenciaDe.get(`${a.membroId}|${classe.id}`);
            return {
              ...a,
              classeId: classe.id,
              classeNome: classe.nome,
              frequencia: f?.percentual ?? null,
              presentes: f?.presentes ?? 0,
              faltas: f?.ausentes ?? 0,
              professor: professores.has(a.membroId),
            };
          }),
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return { alunos, classes, gestao: canGerirEbd(actor.role, actor.podeGerirEbd), periodo };
    },

    async classe(actor: EbdActor, classeId: string) {
      const church = await igreja(actor);
      const classe = await exigeClasse(church.id, classeId);
      const [alunos, aulas, visitantes] = await Promise.all([
        repo.alunos(classeId, hoje()),
        repo.aulasDaClasse(classeId),
        repo.visitantesSemMatricula(classeId),
      ]);
      return { classe, alunos, aulas, visitantes };
    },

    async criarClasse(actor: EbdActor, input: unknown): Promise<string> {
      const church = await gestao(actor);
      const dados = validar(classeSchema, input);
      return repo.criarClasse(church.id, dados);
    },

    async editarClasse(actor: EbdActor, classeId: string, input: unknown): Promise<void> {
      const church = await gestao(actor);
      await exigeClasse(church.id, classeId);
      const dados = validar(classeSchema, input);
      if (!(await repo.editarClasse(church.id, classeId, dados)))
        throw new AppError("not_found", "Classe não encontrada.");
    },

    /** Encerrar a classe tira do resumo e da chamada; matrículas e aulas ficam no histórico. */
    async definirClasseAtiva(actor: EbdActor, classeId: string, ativa: boolean): Promise<void> {
      const church = await gestao(actor);
      await exigeClasse(church.id, classeId);
      if (!(await repo.editarClasse(church.id, classeId, { ativa })))
        throw new AppError("not_found", "Classe não encontrada.");
    },

    async adicionarProfessor(actor: EbdActor, classeId: string, membroId: string): Promise<void> {
      const church = await gestao(actor);
      await exigeClasse(church.id, classeId);
      if (!z.uuid().safeParse(membroId).success) throw new AppError("validation_error", "Pessoa inválida.");
      await repo.adicionarProfessor(church.id, classeId, membroId);
    },

    async removerProfessor(actor: EbdActor, classeId: string, membroId: string): Promise<void> {
      const church = await gestao(actor);
      await exigeClasse(church.id, classeId);
      await repo.removerProfessor(church.id, classeId, membroId);
    },

    /** Página do aluno: dados, resumo e chamadas. O banco decide o que quem pede enxerga. */
    async historicoDoAluno(actor: EbdActor, membroId: unknown): Promise<EbdHistoricoDoAluno> {
      await igreja(actor);
      const id = z.uuid().safeParse(membroId);
      const historico = id.success ? await repo.historicoDoAluno(id.data) : null;
      if (!historico) throw new AppError("not_found", "Aluno não encontrado.");
      return historico;
    },

    /**
     * Edita nome, telefone e nascimento do aluno que a EBD cadastrou e que
     * ainda não é membro (o banco confere; depois, os dados são de Membros).
     */
    async editarAluno(actor: EbdActor, membroId: unknown, input: unknown): Promise<void> {
      await gestao(actor);
      const id = z.uuid().safeParse(membroId);
      if (!id.success) throw new AppError("not_found", "Aluno não encontrado.");
      const dados = validar(editarAlunoSchema, input);
      await repo.editarAluno(id.data, dados);
    },

    /** Professores: quem tem o cargo e quem dá aula, com as classes (só gestão). */
    async professores(actor: EbdActor): Promise<EbdProfessorDaIgreja[]> {
      const church = await gestao(actor);
      return repo.professores(church.id);
    },

    /** Dá o cargo Professor(a) da EBD (só esse; o banco confere a igreja). */
    async darCargoProfessor(actor: EbdActor, membroId: string): Promise<void> {
      await gestao(actor);
      if (!z.uuid().safeParse(membroId).success) throw new AppError("validation_error", "Pessoa inválida.");
      await repo.darCargoProfessor(membroId);
    },

    /** Tira o cargo de quem não dá aula em nenhuma classe. */
    async tirarCargoProfessor(actor: EbdActor, membroId: string): Promise<void> {
      await gestao(actor);
      if (!z.uuid().safeParse(membroId).success) throw new AppError("validation_error", "Pessoa inválida.");
      await repo.tirarCargoProfessor(membroId);
    },

    /** Busca no rol para matricular ou indicar professor (só gestão). */
    async buscarPessoas(actor: EbdActor, termo: string): Promise<EbdPessoaBusca[]> {
      const church = await gestao(actor);
      return repo.buscarPessoas(church.id, termo.slice(0, 60));
    },

    async matricular(actor: EbdActor, classeId: string, membroId: string): Promise<void> {
      const church = await gestao(actor);
      await exigeClasse(church.id, classeId);
      if (!z.uuid().safeParse(membroId).success) throw new AppError("validation_error", "Pessoa inválida.");
      await repo.matricular(classeId, membroId);
    },

    /** Aluno novo, fora do quadro de membros (ex.: criança, visitante que ficou). */
    async matricularNovo(actor: EbdActor, input: unknown): Promise<string> {
      const church = await igreja(actor);
      const dados = validar(novoAlunoSchema, input);
      await exigeClasse(church.id, dados.classeId);
      if (dados.nascimento && dados.nascimento > hoje()) {
        throw new AppError("validation_error", "A data de nascimento não pode ser futura.");
      }
      return repo.matricularNovo(dados);
    },

    async encerrarMatricula(actor: EbdActor, matriculaId: string): Promise<void> {
      await igreja(actor);
      if (!z.uuid().safeParse(matriculaId).success) throw new AppError("validation_error", "Matrícula inválida.");
      await repo.encerrarMatricula(matriculaId);
    },

    /** A chamada da classe no dia: alunos matriculados na data e o que já foi salvo. */
    async abrirAula(actor: EbdActor, classeId: string, data: string): Promise<EbdAulaParaPreencher> {
      const church = await igreja(actor);
      validar(dataISO, data);
      if (data > somarDias(hoje(), 1))
        throw new AppError("validation_error", "Não dá para fazer chamada de data futura.");
      const classe = await exigeClasse(church.id, classeId);
      const [alunos, aula, licao] = await Promise.all([
        repo.alunos(classeId, data),
        repo.getAula(classeId, data),
        repo.licaoDoDia(church.id, data, classeId),
      ]);
      return {
        classe: { id: classe.id, nome: classe.nome },
        data,
        aulaId: aula?.aulaId ?? null,
        alunos,
        presencas: aula?.presencas ?? {},
        visitantes: aula?.visitantes ?? [],
        // Chamada nova já vem com a lição do domingo (do trimestre).
        licao: aula
          ? aula.licao
          : licao
            ? textoDaLicao({ numero: licao.numero, titulo: licao.titulo ?? licao.tituloGeral })
            : null,
        biblias: aula?.biblias ?? 0,
        revistas: aula?.revistas ?? 0,
        ofertaCentavos: aula?.ofertaCentavos ?? 0,
      };
    },

    async salvarAula(actor: EbdActor, input: unknown): Promise<string> {
      const church = await igreja(actor);
      const dados = validar(aulaSchema, input);
      if (dados.data > somarDias(hoje(), 1)) {
        throw new AppError("validation_error", "Não dá para fazer chamada de data futura.");
      }
      await exigeClasse(church.id, dados.classeId);
      const matriculados = new Set((await repo.alunos(dados.classeId, dados.data)).map((a) => a.membroId));
      const vistos = new Set<string>();
      for (const p of dados.presencas) {
        if (vistos.has(p.membroId)) throw new AppError("validation_error", "Aluno repetido na chamada.");
        vistos.add(p.membroId);
        if (!matriculados.has(p.membroId)) {
          throw new AppError(
            "validation_error",
            "A lista tem alguém que não está matriculado nesta classe. Atualize a página.",
          );
        }
      }
      return repo.salvarAula(dados);
    },

    async resumoDoDia(actor: EbdActor, data: string) {
      const church = await igreja(actor);
      validar(dataISO, data);
      return repo.resumoDoDia(church.id, data);
    },

    // ------------------------------------------------- alertas da EBD
    async alertas(actor: EbdActor) {
      const church = await igreja(actor);
      return { igreja: church, alertas: await repo.alertas(church.id) };
    },

    /** Contato feito com aluno em alerta (gestão ou professor da classe). */
    async registrarContato(actor: EbdActor, input: unknown): Promise<void> {
      const church = await igreja(actor);
      const dados = validar(contatoSchema, input);
      if (dados.data > hoje()) throw new AppError("validation_error", "A data do contato não pode ser futura.");
      await exigeClasse(church.id, dados.classeId);
      await repo.registrarContato(church.id, dados);
    },

    async getFaltasAlerta(actor: EbdActor): Promise<number> {
      const church = await gestao(actor);
      return repo.getFaltasAlerta(church.id);
    },

    async salvarFaltasAlerta(actor: EbdActor, faltas: unknown): Promise<void> {
      const church = await gestao(actor);
      const n = validar(z.number().int().min(1, "Mínimo 1").max(20, "Máximo 20"), faltas);
      await repo.saveFaltasAlerta(church.id, n);
    },

    // ----------------------------------------------------- trimestres
    /** Todos leem (para escolher o período); só a gestão cria e edita. */
    async trimestres(actor: EbdActor): Promise<EbdTrimestre[]> {
      const church = await igreja(actor);
      return repo.listTrimestres(church.id);
    },

    async salvarTrimestre(actor: EbdActor, id: string | null, input: unknown): Promise<void> {
      const church = await gestao(actor);
      const dados = validar(trimestreSchema, input);
      if (id && !z.uuid().safeParse(id).success) throw new AppError("validation_error", "Trimestre inválido.");
      const outros = (await repo.listTrimestres(church.id)).filter((t) => t.id !== id);
      const sobreposto = outros.find((t) => t.inicio <= dados.fim && dados.inicio <= t.fim);
      if (sobreposto) {
        throw new AppError("conflict", `As datas se sobrepõem ao "${sobreposto.nome}". Ajuste o início ou o fim.`);
      }
      await repo.salvarTrimestre(church.id, id, dados);
    },

    async removerTrimestre(actor: EbdActor, id: string): Promise<void> {
      const church = await gestao(actor);
      if (!z.uuid().safeParse(id).success) throw new AppError("validation_error", "Trimestre inválido.");
      if (!(await repo.removerTrimestre(church.id, id))) throw new AppError("not_found", "Trimestre não encontrado.");
    },

    // ------------------------------------------------------ relatórios
    async relatorio(actor: EbdActor, filtro: { de: string; ate: string; classeId?: string | null }) {
      const church = await igreja(actor);
      const { de, ate } = validar(periodoSchema, filtro);
      const classeId = filtro.classeId && z.uuid().safeParse(filtro.classeId).success ? filtro.classeId : null;
      const [classes, alunos, domingos] = await Promise.all([
        repo.relatorioClasses(church.id, de, ate),
        repo.frequenciaAlunos(church.id, classeId, de, ate),
        repo.presencaPorDomingo(church.id, classeId, de, ate),
      ]);
      return { classes, alunos, domingos };
    },

    // ------------------------------------------- responsáveis e cuidados
    // Quem pode: quem cuida do rol da igreja ou da classe do aluno — o banco
    // confere (pode_cuidar_do_aluno). Aqui só a validação: a mesma tela serve
    // à EBD e à ficha do membro.
    async responsaveis(membroIds: string[]): Promise<Record<string, EbdResponsavel[]>> {
      const ids = membroIds.filter((id) => z.uuid().safeParse(id).success).slice(0, 500);
      if (ids.length === 0) return {};
      const lista = await repo.responsaveis(ids);
      const porAluno: Record<string, EbdResponsavel[]> = {};
      for (const r of lista) (porAluno[r.membroId] ??= []).push(r);
      return porAluno;
    },

    async salvarResponsavel(input: unknown): Promise<void> {
      await repo.salvarResponsavel(validar(responsavelSchema, input));
    },

    async removerResponsavel(id: string): Promise<void> {
      if (!z.uuid().safeParse(id).success) throw new AppError("validation_error", "Responsável inválido.");
      await repo.removerResponsavel(id);
    },

    async salvarCuidados(membroId: string, texto: unknown): Promise<void> {
      if (!z.uuid().safeParse(membroId).success) throw new AppError("validation_error", "Aluno inválido.");
      const t = validar(vazioVira(z.string().trim().max(500, "Texto longo demais (até 500 letras)")), texto);
      await repo.salvarCuidados(membroId, t);
    },

    // ------------------------------------------------------- promoção
    /** Alunos das classes ativas, para a gestão decidir quem muda de classe. */
    async promocao(actor: EbdActor, data: string) {
      const church = await gestao(actor);
      validar(dataISO, data);
      const classes = (await repo.listClasses(church.id)).filter((c) => c.ativa);
      const porClasse = await Promise.all(classes.map((c) => repo.alunos(c.id, hoje())));
      const linhas: EbdPromocaoLinha[] = porClasse.flatMap((alunos, i) =>
        alunos.map((a) => ({
          membroId: a.membroId,
          nome: a.nome,
          nascimento: a.nascimento,
          membroIgreja: a.membroIgreja,
          classeAtualId: classes[i].id,
          classeAtualNome: classes[i].nome,
        })),
      );
      return { classes, linhas };
    },

    async promover(actor: EbdActor, input: unknown): Promise<number> {
      const church = await gestao(actor);
      const dados = validar(promocaoSchema, input);
      const ativas = new Set((await repo.listClasses(church.id)).filter((c) => c.ativa).map((c) => c.id));
      if (dados.itens.some((i) => !ativas.has(i.classeId))) {
        throw new AppError("validation_error", "Uma das classes de destino não está ativa. Atualize a página.");
      }
      return repo.promover(church.id, dados.data, dados.itens);
    },

    // --------------------------------------------------------- lições
    /** Lições do trimestre; com `classeId`, os títulos da revista daquela classe. */
    async licoes(actor: EbdActor, trimestreId: string, classeId?: string | null) {
      const church = await igreja(actor);
      const trimestre = (await repo.listTrimestres(church.id)).find((t) => t.id === trimestreId);
      if (!trimestre) throw new AppError("not_found", "Trimestre não encontrado.");
      const classe = classeId ? await exigeClasse(church.id, classeId) : null;
      return { trimestre, classe, licoes: await repo.licoes(church.id, trimestreId, classe?.id ?? null) };
    },

    /** Cria uma lição por domingo do trimestre (só as que ainda não existem). */
    async gerarLicoes(actor: EbdActor, trimestreId: string): Promise<number> {
      const church = await gestao(actor);
      const trimestre = (await repo.listTrimestres(church.id)).find((t) => t.id === trimestreId);
      if (!trimestre) throw new AppError("not_found", "Trimestre não encontrado.");
      const existentes = new Set((await repo.licoes(church.id, trimestreId)).map((l) => l.numero));
      const novas = domingosEntre(trimestre.inicio, trimestre.fim)
        .slice(0, 30)
        .map((data, i) => ({ numero: i + 1, data }))
        .filter((l) => !existentes.has(l.numero));
      if (novas.length > 0) await repo.criarLicoes(church.id, trimestreId, novas);
      return novas.length;
    },

    /** Título geral ou, com `classeId`, só o da classe (vazio volta a usar o geral). */
    async salvarTituloLicao(
      actor: EbdActor,
      licaoId: string,
      titulo: unknown,
      classeId?: string | null,
    ): Promise<void> {
      const church = await gestao(actor);
      if (!z.uuid().safeParse(licaoId).success) throw new AppError("validation_error", "Lição inválida.");
      const t = validar(vazioVira(z.string().trim().max(160, "Título longo demais")), titulo);
      if (classeId) await exigeClasse(church.id, classeId);
      if (!(await repo.salvarTituloLicao(church.id, licaoId, t, classeId ?? null))) {
        throw new AppError("not_found", "Lição não encontrada.");
      }
    },

    /**
     * A EBD das igrejas abaixo, só em números. Para quem administra a igreja
     * ou é da secretaria da EBD; professor recebe vazio. A RPC confere a árvore.
     */
    async resumoRede(actor: EbdActor): Promise<EbdRedeIgreja[]> {
      if (!canGerirEbd(actor.role, actor.podeGerirEbd)) return [];
      const church = await repo.getChurch(actor.companyId);
      if (!church) return [];
      return repo.resumoRede(church.id);
    },

    /** Para a ficha do membro; null quando nunca participou. */
    async resumoDoMembro(membroId: string): Promise<EbdResumoMembro | null> {
      const r = await repo.resumoDoMembro(membroId);
      if (!r) return null;
      const participou = r.classeAtual || r.classesAnteriores || r.presencas + r.ausencias + r.justificados > 0;
      return participou ? r : null;
    },
  };
}

export type EbdService = ReturnType<typeof createEbdService>;
