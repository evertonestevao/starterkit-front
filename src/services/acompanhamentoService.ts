import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import {
  lerFiltroQuadro,
  lerFiltroSituacao,
  ordenarAniversarios,
  proximosAniversarios,
  type ProximoAniversario,
} from "@/lib/rolMembros";
import { ESTADOS_CIVIS, FORMAS_ENTRADA, SEXOS, SITUACOES, UFS, cpfValido, fichaVazia, temConjuge } from "@/lib/fichaMembro";
import {
  MOTIVOS,
  RESULTADOS,
  cultoAconteceEm,
  horaAgoraISO,
  hojeISO,
  somarDias,
  sugerirChamada,
} from "@/lib/acompanhamento";
import type {
  AcessoMembro,
  AlertaFaltas,
  ConvitePendente,
  ChamadaParaPreencher,
  ConfigAcompanhamento,
  ContatoRegistrado,
  Culto,
  EstadoPresenca,
  FrequenciaMembro,
  HistoricoMembroItem,
  Justificativa,
  JustificativaLonga,
  MembrosKpis,
  MotivoContato,
  MotivoJustificativa,
  Presenca,
  RelatorioChamada,
  ResultadoContato,
  ResumoAcompanhamento,
  ResumoRedeIgreja,
  RolMembro,
  SugestaoChamada,
  Visitante,
  Aniversario,
  FichaMembro,
  SituacaoMembro,
} from "@/types/acompanhamento";
import { LIMITE_IMPORTACAO, chaveDePessoa } from "@/lib/importarMembros";
import { normalizeSearch } from "@/lib/search";
import type { CargoResumo } from "@/types/cargos";
import type { RoleCode } from "@/types/database";
import { normalizePageParams, type Paginated } from "./tenantService";

/**
 * Chamada e Acompanhamento.
 *
 * Os cultos são os itens da Programação (church_schedule) marcados para
 * chamada; este módulo só os lê — quem cria e edita é a tela Programação.
 *
 * Quem usa: owner/admin da igreja e o member que o responsável autorizou
 * (cargo com Presença ou Membros liberado). Tudo opera sobre a igreja da EMPRESA ATIVA — o id da
 * igreja nunca vem do client; ids de membro/culto/justificativa vindos do
 * client são sempre conferidos contra essa igreja no repositório (e de novo
 * pela RLS, que só abre a própria igreja).
 *
 * LGPD: a igreja de cima não lê nada daqui; recebe só números pelo
 * `resumoRede`.
 */

export interface IgrejaDoAcompanhamento {
  id: string;
  name: string;
}

export interface NovoMembro {
  nome: string;
  whatsapp: string | null;
  email: string | null;
  participaChamada: boolean;
  membroIgreja: boolean;
  nascimento: string | null;
  /** Opcional: quem não manda (ex.: aluno novo da EBD) não altera. */
  batismo?: string | null;
  ativo: boolean;
  observacoes: string | null;
}

export interface NovaJustificativa {
  membroId: string;
  motivo: MotivoJustificativa;
  motivoTexto: string | null;
  dataInicio: string;
  dataFim: string;
}

export interface PresencaParaSalvar {
  membroId: string;
  estado: EstadoPresenca;
  justificativaId: string | null;
  motivo: MotivoJustificativa | null;
  motivoTexto: string | null;
}

export interface AcompanhamentoRepository {
  /** A igreja da empresa (a primeira, se houver mais de uma). */
  getChurch(companyId: string): Promise<IgrejaDoAcompanhamento | null>;

  listMembros(churchId: string): Promise<RolMembro[]>;
  /** Uma página do rol, com o total. `busca` já vem sem acento e minúscula. */
  listMembrosPagina(
    churchId: string,
    filtro: {
      busca: string | null;
      /** null = todas as situações. */
      situacao: SituacaoMembro | null;
      cargoId: string | null;
      /** true = só do quadro de membros; false = só quem não é; ausente = todos. */
      membroIgreja?: boolean;
      limit: number;
      offset: number;
    },
  ): Promise<{ items: RolMembro[]; total: number }>;
  /** Fichas de todos os membros da igreja, por id (vazio para quem não tem o módulo Membros). */
  listFichas(churchId: string): Promise<Record<string, FichaMembro>>;
  /** RPC aniversariantes_do_mes: nascimento, batismo e (com acesso à ficha) casamento. */
  aniversariantes(churchId: string, mes: number): Promise<Aniversario[]>;
  kpisMembros(churchId: string): Promise<MembrosKpis>;
  /** Quem tem login na empresa e os convites pendentes (RLS: convites só para admin). */
  listAcessos(companyId: string): Promise<{ acessos: AcessoMembro[]; convites: ConvitePendente[] }>;
  /** E-mails de todos os membros da igreja (minúsculos). */
  listEmailsDoRol(churchId: string): Promise<string[]>;
  /** Cargos que a igreja pode dar (padrão + de cima + os dela, ativos). */
  listCargosDisponiveis(churchId: string): Promise<CargoResumo[]>;
  /** Troca os cargos do membro pelos da lista (tira os que saíram, põe os novos). */
  setCargosDoMembro(churchId: string, membroId: string, cargoIds: string[]): Promise<void>;
  getMembro(churchId: string, membroId: string): Promise<RolMembro | null>;
  createMembro(churchId: string, input: NovoMembro): Promise<string>;
  /** Vários de uma vez (importação). Devolve quantos entraram. */
  createMembros(churchId: string, membros: NovoMembro[]): Promise<number>;
  /** Nome, nascimento e e-mail de todos os membros não excluídos (para achar repetidos na importação). */
  listPessoasDoRol(churchId: string): Promise<Array<{ nome: string; nascimento: string | null; email: string | null }>>;
  /** Exclui o cadastro (RPC excluir_membro: tira cargos, encerra matrícula). */
  excluirMembro(membroId: string): Promise<void>;
  updateMembro(churchId: string, membroId: string, input: NovoMembro): Promise<boolean>;
  /** Ficha completa; null se ainda não há (ou se quem pede não tem o módulo Membros). */
  getFicha(churchId: string, membroId: string): Promise<FichaMembro | null>;
  /** RPC salvar_ficha_membro: confere o acesso e ajusta "ativo" quando a situação muda. */
  salvarFicha(membroId: string, ficha: FichaMembro): Promise<void>;

  /** Itens ativos da programação da igreja (com e sem chamada). */
  listCultos(churchId: string): Promise<Culto[]>;
  /** Um item da programação, inclusive removido (para o histórico). */
  getCulto(churchId: string, cultoId: string): Promise<Culto | null>;

  getChamada(
    churchId: string,
    cultoId: string,
    data: string,
  ): Promise<{ chamadaId: string; presencas: Presenca[]; visitantes: Visitante[] } | null>;
  salvarChamada(input: {
    cultoId: string;
    data: string;
    presencas: PresencaParaSalvar[];
    visitantes: Visitante[];
  }): Promise<string>;

  /** Justificativas não removidas que terminam em `fimAPartirDe` ou depois. */
  listJustificativas(churchId: string, filtro: { fimAPartirDe?: string; membroId?: string }): Promise<Justificativa[]>;
  getJustificativa(churchId: string, id: string): Promise<Justificativa | null>;
  createJustificativa(churchId: string, input: NovaJustificativa): Promise<string>;
  updateJustificativa(
    churchId: string,
    id: string,
    input: Partial<Omit<NovaJustificativa, "membroId">> & { encerradaEm?: string; deletedAt?: string },
  ): Promise<boolean>;

  registrarContato(
    churchId: string,
    input: {
      membroId: string;
      motivo: MotivoContato;
      data: string;
      resultado: ResultadoContato;
      observacao: string | null;
    },
  ): Promise<void>;
  listContatos(churchId: string, membroId: string): Promise<ContatoRegistrado[]>;

  alertas(churchId: string): Promise<AlertaFaltas[]>;
  justificativasLongas(churchId: string): Promise<JustificativaLonga[]>;
  relatorioChamadas(churchId: string, de: string, ate: string): Promise<RelatorioChamada[]>;
  frequencia(churchId: string, de: string, ate: string): Promise<FrequenciaMembro[]>;
  historicoMembro(churchId: string, membroId: string): Promise<HistoricoMembroItem[]>;
  resumo(churchId: string): Promise<ResumoAcompanhamento>;
  resumoRede(churchId: string): Promise<ResumoRedeIgreja[]>;

  getConfig(churchId: string): Promise<ConfigAcompanhamento>;
  saveConfig(churchId: string, config: ConfigAcompanhamento): Promise<void>;
}

export interface AcompanhamentoActor {
  companyId: string;
  role: RoleCode;
  podeAcompanhar: boolean;
}

/** Owner/admin sempre; member só com a autorização do responsável. */
export function canAcompanhar(role: RoleCode, podeAcompanhar: boolean): boolean {
  return role === "owner" || role === "admin" || (role === "member" && podeAcompanhar);
}

/** Números da rede: decisão de gestão, só owner/admin (a RPC confere a árvore). */
export function canVerResumoRede(role: RoleCode): boolean {
  return role === "owner" || role === "admin";
}

/** Opções de "quantos por página" na lista de membros. */
export const MEMBROS_POR_PAGINA = [10, 20, 50, 100] as const;
export const MEMBROS_POR_PAGINA_PADRAO = 20;

/** Regras do alerta: só quem administra muda. */
export function canConfigurar(role: RoleCode): boolean {
  return role === "owner" || role === "admin";
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------
/** Campo de formulário vazio ou ausente vira null. */
const vazioVira = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

const dataISO = z.iso.date("Data inválida");
const uuid = (msg: string) => z.uuid(msg);

const membroSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Nome longo demais"),
  whatsapp: vazioVira(
    z
      .string()
      .trim()
      .max(20, "Telefone inválido")
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone com DDD, por favor"),
  ),
  email: vazioVira(z.email("E-mail inválido").max(254, "E-mail longo demais").transform((v) => v.toLowerCase())),
  participaChamada: z.boolean().default(true),
  membroIgreja: z.boolean().default(true),
  nascimento: vazioVira(dataISO),
  batismo: vazioVira(dataISO).optional(),
  ativo: z.boolean(),
  observacoes: vazioVira(z.string().trim().max(1000, "Observação longa demais")),
});

/** Linhas da planilha: só os campos importáveis, no formato do formulário. */
const importacaoSchema = z
  .array(
    z.object({
      nome: z.string().max(200),
      whatsapp: z.string().max(40).optional(),
      email: z.string().max(300).optional(),
      nascimento: z.string().max(20).optional(),
      batismo: z.string().max(20).optional(),
      observacoes: z.string().max(1200).optional(),
      /** A pessoa conferiu um possível repetido e disse que é OUTRA pessoa. */
      outraPessoa: z.boolean().optional(),
    }),
    "Planilha inválida",
  )
  .min(1, "Nenhuma linha para importar")
  .max(LIMITE_IMPORTACAO, `Importe até ${LIMITE_IMPORTACAO} membros por vez`);

const justificativaSchema = z
  .object({
    membroId: uuid("Escolha o membro"),
    motivo: z.enum(MOTIVOS as [MotivoJustificativa, ...MotivoJustificativa[]], "Escolha o motivo"),
    motivoTexto: vazioVira(z.string().trim().max(300, "Texto longo demais")),
    dataInicio: dataISO,
    dataFim: dataISO,
  })
  .refine((v) => v.dataFim >= v.dataInicio, { message: "A data final vem depois da inicial", path: ["dataFim"] })
  .refine((v) => (Date.parse(v.dataFim) - Date.parse(v.dataInicio)) / 86_400_000 <= 366, {
    message: "Período máximo de um ano",
    path: ["dataFim"],
  });

const chamadaSchema = z.object({
  cultoId: uuid("Culto inválido"),
  data: dataISO,
  presencas: z
    .array(
      z.object({
        membroId: uuid("Membro inválido"),
        estado: z.enum(["presente", "ausente", "justificado"]),
        justificativaId: z.uuid().nullable().default(null),
        motivo: z.enum(MOTIVOS as [MotivoJustificativa, ...MotivoJustificativa[]]).nullable().default(null),
        motivoTexto: vazioVira(z.string().trim().max(300)),
      }),
    )
    .max(2000, "Lista grande demais"),
  visitantes: z
    .array(
      z.object({
        nome: z.string().trim().min(2, "Nome do visitante muito curto").max(120),
        telefone: vazioVira(z.string().trim().min(8, "Telefone do visitante inválido").max(20)),
      }),
    )
    .max(200, "Visitantes demais"),
});

const cargosDoMembroSchema = z.array(z.uuid("Cargo inválido")).max(20, "Cargos demais para uma pessoa");

const contatoSchema = z.object({
  membroId: uuid("Membro inválido"),
  motivo: z.enum(["faltas", "justificativa_longa"]),
  data: dataISO,
  resultado: z.enum(RESULTADOS as [ResultadoContato, ...ResultadoContato[]], "Escolha o resultado"),
  observacao: vazioVira(z.string().trim().max(1000, "Observação longa demais")),
});

const configSchema = z.object({
  faltasAlerta: z.number().int().min(1, "Mínimo 1").max(20, "Máximo 20"),
  justificativaLongaCultos: z.number().int().min(1).max(50),
  justificativaLongaDias: z.number().int().min(1).max(365),
});

const periodoSchema = z
  .object({ de: dataISO, ate: dataISO })
  .refine((v) => v.ate >= v.de, { message: "Período inválido", path: ["ate"] });

const textoCurto = (max: number, msg: string) => vazioVira(z.string().trim().max(max, msg));

const fichaSchema = z
  .object({
    numeroFicha: textoCurto(20, "Número da ficha longo demais"),
    cpf: vazioVira(
      z
        .string()
        .transform((v) => v.replace(/\D/g, ""))
        .refine(cpfValido, "CPF inválido: confira os números"),
    ),
    rg: textoCurto(20, "RG longo demais"),
    telefone2: vazioVira(
      z.string().trim().min(8, "Segundo telefone curto demais").max(20, "Segundo telefone longo demais"),
    ),
    sexo: vazioVira(z.enum(SEXOS, "Sexo inválido")),
    estadoCivil: vazioVira(z.enum(ESTADOS_CIVIS, "Estado civil inválido")),
    naturalidade: textoCurto(120, "Naturalidade longa demais"),
    profissao: textoCurto(120, "Profissão longa demais"),
    conjugeNome: textoCurto(120, "Nome do cônjuge longo demais"),
    dataCasamento: vazioVira(dataISO),
    paiNome: textoCurto(120, "Nome do pai longo demais"),
    maeNome: textoCurto(120, "Nome da mãe longo demais"),
    filhos: textoCurto(500, "Texto dos filhos longo demais"),
    cep: vazioVira(
      z
        .string()
        .transform((v) => v.replace(/\D/g, ""))
        .refine((v) => v.length === 8, "CEP com 8 dígitos, por favor"),
    ),
    logradouro: textoCurto(160, "Endereço longo demais"),
    numero: textoCurto(20, "Número longo demais"),
    complemento: textoCurto(80, "Complemento longo demais"),
    bairro: textoCurto(80, "Bairro longo demais"),
    cidade: textoCurto(80, "Cidade longa demais"),
    uf: vazioVira(z.enum(UFS, "Estado (UF) inválido")),
    dataConversao: vazioVira(dataISO),
    entradaForma: vazioVira(z.enum(FORMAS_ENTRADA, "Forma de entrada inválida")),
    membroDesde: vazioVira(dataISO),
    igrejaOrigem: textoCurto(160, "Igreja de origem longa demais"),
    batismoAguasLocal: textoCurto(120, "Local do batismo longo demais"),
    batismoEspiritoData: vazioVira(dataISO),
    batismoEspiritoLocal: textoCurto(120, "Local do batismo no Espírito Santo longo demais"),
    consagracaoMinisterio: textoCurto(120, "Ministério da consagração longo demais"),
    consagracaoOndePorQuem: textoCurto(200, "Texto da consagração longo demais"),
    situacao: z.enum(SITUACOES, "Situação inválida"),
    situacaoEm: vazioVira(dataISO),
    situacaoMotivo: textoCurto(300, "Motivo longo demais"),
  })
  .transform((f) => ({
    ...f,
    // Sem cônjuge, não guarda nome nem data de casamento de um estado civil anterior.
    conjugeNome: temConjuge(f.estadoCivil) ? f.conjugeNome : null,
    dataCasamento: temConjuge(f.estadoCivil) ? f.dataCasamento : null,
  }));

/** Teto da exportação: acima disso a planilha avisa que veio cortada. */
export const EXPORTACAO_MAXIMO = 10_000;

/** Filtro de situação da tela → o que o repositório entende (null = todas). */
function situacaoDoFiltro(valor: string | null | undefined): SituacaoMembro | null {
  const filtro = lerFiltroSituacao(valor);
  return filtro === "todas" ? null : filtro;
}

function validar<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw toValidationError(parsed.error.issues);
  return parsed.data;
}

export function createAcompanhamentoService(deps: {
  repo: AcompanhamentoRepository;
  hoje?: () => string;
  horaAgora?: () => string;
}) {
  const { repo } = deps;
  const hoje = deps.hoje ?? (() => hojeISO());
  const horaAgora = deps.horaAgora ?? (() => horaAgoraISO());

  async function igreja(actor: AcompanhamentoActor): Promise<IgrejaDoAcompanhamento> {
    if (!canAcompanhar(actor.role, actor.podeAcompanhar)) {
      throw new AppError("forbidden", "Você não tem autorização para a chamada desta igreja.");
    }
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Esta conta ainda não tem uma igreja cadastrada.");
    return church;
  }

  /**
   * Chamada NOVA só para culto ativo, marcado para chamada, no dia dele. Uma
   * já feita reabre sempre (o culto pode ter mudado depois). O banco
   * (salvar_chamada) confere de novo; aqui a mensagem sai legível.
   */
  function exigeChamadaNovaPermitida(culto: Culto, data: string) {
    if (culto.removido) throw new AppError("validation_error", "Este culto saiu da programação.");
    if (!culto.registraChamada) {
      throw new AppError("validation_error", "Este culto está sem chamada. Ligue a opção na Programação.");
    }
    if (!cultoAconteceEm(culto, data)) {
      throw new AppError("validation_error", "Nesta data não tem este culto. Escolha um dia em que ele acontece.");
    }
  }

  async function exigeMembro(churchId: string, membroId: string) {
    const membro = await repo.getMembro(churchId, membroId);
    if (!membro) throw new AppError("not_found", "Membro não encontrado.");
    return membro;
  }

  return {
    igreja,

    // ------------------------------------------------------------ membros
    async listMembros(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return repo.listMembros(church.id);
    },

    /**
     * Rol paginado para a tela de Membros. Página, tamanho e busca vêm da
     * URL: valores fora do esperado voltam para o padrão em vez de dar erro.
     */
    async listMembrosPaginado(
      actor: AcompanhamentoActor,
      params: {
        page?: number;
        pageSize?: number;
        busca?: string;
        /** Antigo "mostrar inativos": o mesmo que situação "todas". */
        inativos?: boolean;
        situacao?: string;
        cargoId?: string;
      },
    ): Promise<Paginated<RolMembro>> {
      const church = await igreja(actor);
      const tamanho = MEMBROS_POR_PAGINA.includes(params.pageSize as (typeof MEMBROS_POR_PAGINA)[number])
        ? (params.pageSize as number)
        : MEMBROS_POR_PAGINA_PADRAO;
      const { page, pageSize, offset } = normalizePageParams({ page: params.page, pageSize: tamanho }, tamanho);
      const busca = normalizeSearch(params.busca ?? "").slice(0, 100) || null;
      const cargoId = params.cargoId && z.uuid().safeParse(params.cargoId).success ? params.cargoId : null;
      const { items, total } = await repo.listMembrosPagina(church.id, {
        busca,
        situacao: situacaoDoFiltro(params.inativos && !params.situacao ? "todas" : params.situacao),
        cargoId,
        limit: pageSize,
        offset,
      });
      return { items, total, page, pageSize };
    },

    /**
     * O rol inteiro com os filtros da lista, para exportar (planilha ou PDF).
     * As fichas vêm junto quando quem pede tem o módulo Membros (a RLS decide);
     * sem ele, `fichas` volta vazio e a planilha sai só com os dados da lista.
     */
    async exportarMembros(
      actor: AcompanhamentoActor,
      params: { situacao?: string; cargoId?: string; quadro?: string; comFichas?: boolean },
    ): Promise<{ igreja: string; membros: RolMembro[]; fichas: Record<string, FichaMembro>; cortado: boolean }> {
      const church = await igreja(actor);
      const cargoId = params.cargoId && z.uuid().safeParse(params.cargoId).success ? params.cargoId : null;
      const quadro = lerFiltroQuadro(params.quadro);
      const membros: RolMembro[] = [];
      let total = 0;
      for (let offset = 0; offset < EXPORTACAO_MAXIMO; offset += 500) {
        const pagina = await repo.listMembrosPagina(church.id, {
          busca: null,
          situacao: situacaoDoFiltro(params.situacao),
          cargoId,
          ...(quadro === "todos" ? {} : { membroIgreja: quadro === "membros" }),
          limit: 500,
          offset,
        });
        total = pagina.total;
        membros.push(...pagina.items);
        if (pagina.items.length < 500) break;
      }
      const fichas = params.comFichas ? await repo.listFichas(church.id) : {};
      return { igreja: church.name, membros, fichas, cortado: total > membros.length };
    },

    /** Os próximos aniversários, batismos e casamentos a partir de hoje (este mês e o seguinte). */
    async proximosAniversarios(
      actor: AcompanhamentoActor,
      limite: number,
    ): Promise<{ igreja: string; itens: ProximoAniversario[] }> {
      const church = await igreja(actor);
      const hojeData = hoje();
      const mes = Number(hojeData.slice(5, 7));
      const [esteMes, proximoMes] = await Promise.all([
        repo.aniversariantes(church.id, mes),
        repo.aniversariantes(church.id, mes === 12 ? 1 : mes + 1),
      ]);
      return { igreja: church.name, itens: proximosAniversarios(esteMes, proximoMes, hojeData, limite) };
    },

    /** Aniversários, batismos e casamentos do mês (1 a 12), por dia. Só pessoas ativas. */
    async aniversariantes(actor: AcompanhamentoActor, mes: number): Promise<{ igreja: string; itens: Aniversario[] }> {
      const church = await igreja(actor);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new AppError("validation_error", "Mês inválido.");
      return { igreja: church.name, itens: ordenarAniversarios(await repo.aniversariantes(church.id, mes)) };
    },

    async getMembro(actor: AcompanhamentoActor, membroId: string) {
      const church = await igreja(actor);
      validar(uuid("Membro inválido"), membroId);
      const membro = await exigeMembro(church.id, membroId);
      const [historico, justificativas, contatos] = await Promise.all([
        repo.historicoMembro(church.id, membroId),
        repo.listJustificativas(church.id, { membroId }),
        repo.listContatos(church.id, membroId),
      ]);
      return { membro, historico, justificativas, contatos };
    },

    /**
     * Acesso ao sistema por conta (userId) e convites pendentes por e-mail,
     * para as etiquetas e a ficha do membro. Gerenciar o acesso continua nas
     * actions de equipe (tenant), que conferem o papel de quem pede.
     */
    async acessos(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      const [{ acessos, convites }, emails] = await Promise.all([
        repo.listAcessos(actor.companyId),
        repo.listEmailsDoRol(church.id),
      ]);
      const doRol = new Set(emails);
      return {
        /** Convites para e-mails que ainda não são membros (ao aceitar, viram). */
        convitesSemMembro: convites.filter((c) => !doRol.has(c.email.toLowerCase())),
        porUsuario: Object.fromEntries(acessos.map((a) => [a.userId, a])) as Record<string, AcessoMembro>,
        convitePorEmail: Object.fromEntries(convites.map((c) => [c.email.toLowerCase(), c])) as Record<
          string,
          ConvitePendente
        >,
      };
    },

    /** Indicadores do topo da tela de Membros. */
    async kpisMembros(actor: AcompanhamentoActor): Promise<MembrosKpis> {
      const church = await igreja(actor);
      return repo.kpisMembros(church.id);
    },

    /** Cargos para o formulário de membro (só os que ainda podem ser dados). */
    async cargosDisponiveis(actor: AcompanhamentoActor): Promise<CargoResumo[]> {
      const church = await igreja(actor);
      return repo.listCargosDisponiveis(church.id);
    },

    /**
     * Cadastra ou edita o membro. `cargoIds` ausente = não mexe nos cargos;
     * lista (mesmo vazia) = os cargos passam a ser exatamente esses. Um cargo
     * desativado que a pessoa já tinha pode continuar; novo, só disponível.
     */
    async salvarMembro(
      actor: AcompanhamentoActor,
      membroId: string | null,
      input: unknown,
      cargoIds?: unknown,
    ): Promise<string> {
      const church = await igreja(actor);
      const dados = validar(membroSchema, input);
      // Cargo é acesso: só quem administra a igreja dá ou tira (a RLS repete).
      // De quem só cuida do cadastro, os cargos enviados são ignorados.
      const cargos =
        cargoIds === undefined || !canConfigurar(actor.role) ? undefined : validar(cargosDoMembroSchema, cargoIds);

      if (cargos) {
        const disponiveis = new Set((await repo.listCargosDisponiveis(church.id)).map((c) => c.id));
        const atuais = new Set(
          membroId ? ((await repo.getMembro(church.id, membroId))?.cargos.map((c) => c.id) ?? []) : [],
        );
        if (cargos.some((id) => !disponiveis.has(id) && !atuais.has(id))) {
          throw new AppError("validation_error", "Um dos cargos não está disponível para esta igreja. Atualize a página.");
        }
      }

      let id = membroId;
      if (!id) {
        id = await repo.createMembro(church.id, dados);
      } else {
        validar(uuid("Membro inválido"), id);
        if (!(await repo.updateMembro(church.id, id, dados))) {
          throw new AppError("not_found", "Membro não encontrado.");
        }
      }
      if (cargos) await repo.setCargosDoMembro(church.id, id, [...new Set(cargos)]);
      return id;
    },

    /**
     * Só os cargos do membro (atalho da lista). Cargo é acesso: só quem
     * administra a igreja; a lista enviada passa a ser exatamente os cargos.
     */
    async definirCargos(actor: AcompanhamentoActor, membroId: unknown, cargoIds: unknown): Promise<void> {
      if (!canConfigurar(actor.role)) {
        throw new AppError("forbidden", "Só o Responsável ou o Administrador altera os cargos.");
      }
      const church = await igreja(actor);
      const id = validar(uuid("Membro inválido"), membroId);
      const cargos = validar(cargosDoMembroSchema, cargoIds);
      const membro = await repo.getMembro(church.id, id);
      if (!membro) throw new AppError("not_found", "Membro não encontrado.");
      const disponiveis = new Set((await repo.listCargosDisponiveis(church.id)).map((c) => c.id));
      const atuais = new Set(membro.cargos.map((c) => c.id));
      if (cargos.some((c) => !disponiveis.has(c) && !atuais.has(c))) {
        throw new AppError("validation_error", "Um dos cargos não está disponível para esta igreja. Atualize a página.");
      }
      await repo.setCargosDoMembro(church.id, id, [...new Set(cargos)]);
    },

    /**
     * Exclui um cadastro feito por engano. Quem tem login não sai por aqui:
     * primeiro remove-se o acesso (só quem administra), depois exclui.
     */
    async excluirMembro(actor: AcompanhamentoActor, membroId: unknown): Promise<{ nome: string }> {
      const church = await igreja(actor);
      const id = validar(uuid("Membro inválido"), membroId);
      const membro = await repo.getMembro(church.id, id);
      if (!membro) throw new AppError("not_found", "Membro não encontrado.");
      if (membro.userId) {
        throw new AppError(
          "conflict",
          "Este membro tem acesso ao sistema. Remova o acesso dele primeiro, na ficha, e depois exclua.",
        );
      }
      await repo.excluirMembro(id);
      return { nome: membro.nome };
    },

    /** Ficha completa do membro; quem ainda não tem recebe uma em branco. */
    async getFicha(actor: AcompanhamentoActor, membroId: unknown): Promise<FichaMembro> {
      const church = await igreja(actor);
      const id = validar(uuid("Membro inválido"), membroId);
      const membro = await exigeMembro(church.id, id);
      return (await repo.getFicha(church.id, id)) ?? fichaVazia(membro.ativo);
    },

    /**
     * Grava a ficha. Situação diferente de "ativo" guarda a data (hoje, se
     * não informada) e tira a pessoa da chamada; o banco confere o acesso ao
     * módulo Membros e faz o ajuste do "ativo".
     */
    async salvarFicha(
      actor: AcompanhamentoActor,
      membroId: unknown,
      input: unknown,
    ): Promise<{ nome: string; situacao: SituacaoMembro }> {
      const church = await igreja(actor);
      const id = validar(uuid("Membro inválido"), membroId);
      const ficha = validar(fichaSchema, input);
      const membro = await exigeMembro(church.id, id);
      const hojeData = hoje();
      for (const [data, nome] of [
        [ficha.dataCasamento, "casamento"],
        [ficha.dataConversao, "conversão"],
        [ficha.membroDesde, "entrada como membro"],
        [ficha.batismoEspiritoData, "batismo no Espírito Santo"],
        [ficha.situacaoEm, "situação"],
      ] as const) {
        if (data && data > hojeData) throw new AppError("validation_error", `A data de ${nome} não pode ser no futuro.`);
      }
      const ativo = ficha.situacao === "ativo";
      await repo.salvarFicha(id, {
        ...ficha,
        situacaoEm: ativo ? null : (ficha.situacaoEm ?? hojeData),
        situacaoMotivo: ativo ? null : ficha.situacaoMotivo,
      });
      return { nome: membro.nome, situacao: ficha.situacao };
    },

    /** Quem a igreja já tem (nome e nascimento), para a tela avisar os possíveis repetidos antes de importar. */
    async pessoasParaConferir(actor: AcompanhamentoActor): Promise<Array<{ nome: string; nascimento: string | null }>> {
      const church = await igreja(actor);
      return (await repo.listPessoasDoRol(church.id)).map((m) => ({ nome: m.nome, nascimento: m.nascimento }));
    },

    /**
     * Importa membros de uma planilha já lida no navegador. Tudo é validado
     * de novo aqui (o navegador não é fonte de verdade).
     *
     * Repetido = mesmo nome E mesma data de nascimento de alguém já
     * cadastrado ou de uma linha anterior (homônimos entram). O repetido só
     * entra se a pessoa confirmou na conferência que é OUTRA pessoa
     * (`outraPessoa`); sem isso, fica de fora. E-mail já usado nunca entra
     * (o e-mail é único na igreja). Cargos e acesso não são importados.
     */
    async importarMembros(
      actor: AcompanhamentoActor,
      linhas: unknown,
    ): Promise<{ importados: number; ignorados: Array<{ nome: string; motivo: string }> }> {
      const church = await igreja(actor);
      const entrada = validar(importacaoSchema, linhas);
      const existentes = await repo.listPessoasDoRol(church.id);
      const pessoas = new Set(existentes.map((m) => chaveDePessoa(m.nome, m.nascimento)));
      const emails = new Set(existentes.flatMap((m) => (m.email ? [m.email.toLowerCase()] : [])));

      const novos: NovoMembro[] = [];
      const ignorados: Array<{ nome: string; motivo: string }> = [];
      for (const linha of entrada) {
        const lido = membroSchema.safeParse({ ...linha, ativo: true });
        const nome = String(linha.nome ?? "").trim() || "(sem nome)";
        if (!lido.success) {
          ignorados.push({ nome, motivo: lido.error.issues[0]?.message ?? "dados inválidos" });
          continue;
        }
        const chave = chaveDePessoa(lido.data.nome, lido.data.nascimento);
        if (pessoas.has(chave) && !linha.outraPessoa) {
          ignorados.push({
            nome,
            motivo: lido.data.nascimento
              ? "já cadastrado (mesmo nome e mesma data de nascimento)"
              : "já cadastrado (mesmo nome, sem data de nascimento para diferenciar)",
          });
          continue;
        }
        if (lido.data.email && emails.has(lido.data.email)) {
          ignorados.push({ nome, motivo: "e-mail já usado por outro membro" });
          continue;
        }
        pessoas.add(chave);
        if (lido.data.email) emails.add(lido.data.email);
        novos.push(lido.data);
      }

      const importados = novos.length > 0 ? await repo.createMembros(church.id, novos) : 0;
      return { importados, ignorados };
    },

    // ------------------------------------------------------------- cultos
    async listCultos(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return repo.listCultos(church.id);
    },

    /** O culto (e a data) que a chamada deve abrir agora, pelo dia e hora. */
    async sugestao(actor: AcompanhamentoActor): Promise<SugestaoChamada | null> {
      const church = await igreja(actor);
      return sugerirChamada(await repo.listCultos(church.id), hoje(), horaAgora());
    },

    async historicoCulto(actor: AcompanhamentoActor, cultoId: string) {
      const church = await igreja(actor);
      validar(uuid("Culto inválido"), cultoId);
      const culto = await repo.getCulto(church.id, cultoId);
      if (!culto) throw new AppError("not_found", "Culto não encontrado.");
      const chamadas = await repo.relatorioChamadas(church.id, somarDias(hoje(), -366), somarDias(hoje(), 1));
      return { culto, chamadas: chamadas.filter((c) => c.cultoId === cultoId) };
    },

    // ------------------------------------------------------------ chamada
    async abrirChamada(actor: AcompanhamentoActor, cultoId: string, data: string): Promise<ChamadaParaPreencher> {
      const church = await igreja(actor);
      validar(uuid("Culto inválido"), cultoId);
      validar(dataISO, data);
      if (data > somarDias(hoje(), 1)) throw new AppError("validation_error", "Não dá para fazer chamada de data futura.");

      const culto = await repo.getCulto(church.id, cultoId);
      if (!culto) throw new AppError("not_found", "Culto não encontrado.");

      const [membros, chamada, justificativas] = await Promise.all([
        repo.listMembros(church.id),
        repo.getChamada(church.id, cultoId, data),
        repo.listJustificativas(church.id, { fimAPartirDe: data }),
      ]);

      if (!chamada) exigeChamadaNovaPermitida(culto, data);

      // Membro inativo, ou que não participa da chamada (login que só
      // administra), só aparece se já constava nesta chamada (histórico).
      const naChamada = new Set(chamada?.presencas.map((p) => p.membroId) ?? []);
      return {
        culto,
        data,
        chamadaId: chamada?.chamadaId ?? null,
        membros: membros.filter((m) => (m.ativo && m.participaChamada) || naChamada.has(m.id)),
        presencas: chamada?.presencas ?? [],
        visitantes: chamada?.visitantes ?? [],
        justificativas: justificativas.filter((j) => j.dataInicio <= data && data <= j.dataFim),
      };
    },

    async salvarChamada(actor: AcompanhamentoActor, input: unknown): Promise<string> {
      const church = await igreja(actor);
      const dados = validar(chamadaSchema, input);
      if (dados.data > somarDias(hoje(), 1)) {
        throw new AppError("validation_error", "Não dá para fazer chamada de data futura.");
      }
      const culto = await repo.getCulto(church.id, dados.cultoId);
      if (!culto) throw new AppError("not_found", "Culto não encontrado.");
      if (!(await repo.getChamada(church.id, culto.id, dados.data))) exigeChamadaNovaPermitida(culto, dados.data);

      const ids = new Set<string>();
      for (const p of dados.presencas) {
        if (ids.has(p.membroId)) throw new AppError("validation_error", "Membro repetido na chamada.");
        ids.add(p.membroId);
      }
      // A RPC e o trigger também conferem a igreja de cada membro; aqui o erro sai legível.
      const doRol = new Set((await repo.listMembros(church.id)).map((m) => m.id));
      if ([...ids].some((id) => !doRol.has(id))) {
        throw new AppError("validation_error", "A lista tem alguém que não é membro desta igreja. Atualize a página.");
      }

      return repo.salvarChamada({
        cultoId: dados.cultoId,
        data: dados.data,
        presencas: dados.presencas,
        visitantes: dados.visitantes,
      });
    },

    // ----------------------------------------------------- justificativas
    /** Ativas e futuras (ainda não terminaram). */
    async listJustificativasAtivas(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return repo.listJustificativas(church.id, { fimAPartirDe: hoje() });
    },

    async salvarJustificativa(actor: AcompanhamentoActor, id: string | null, input: unknown): Promise<string> {
      const church = await igreja(actor);
      const dados = validar(justificativaSchema, input);
      await exigeMembro(church.id, dados.membroId);
      if (!id) return repo.createJustificativa(church.id, dados);

      validar(uuid("Justificativa inválida"), id);
      const atual = await repo.getJustificativa(church.id, id);
      if (!atual) throw new AppError("not_found", "Justificativa não encontrada.");
      if (atual.membroId !== dados.membroId) {
        throw new AppError("validation_error", "Para outro membro, registre uma justificativa nova.");
      }
      await repo.updateJustificativa(church.id, id, {
        motivo: dados.motivo,
        motivoTexto: dados.motivoTexto,
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim,
      });
      return id;
    },

    /**
     * Encerra antes do prazo: a justificativa passa a valer até ontem. Se nem
     * começou, é cancelada (some da lista).
     */
    async encerrarJustificativa(actor: AcompanhamentoActor, id: string) {
      const church = await igreja(actor);
      validar(uuid("Justificativa inválida"), id);
      const atual = await repo.getJustificativa(church.id, id);
      if (!atual) throw new AppError("not_found", "Justificativa não encontrada.");

      const ontem = somarDias(hoje(), -1);
      const agora = new Date().toISOString();
      if (atual.dataInicio > ontem) {
        await repo.updateJustificativa(church.id, id, { deletedAt: agora });
        return;
      }
      await repo.updateJustificativa(church.id, id, {
        dataFim: atual.dataFim < ontem ? atual.dataFim : ontem,
        encerradaEm: agora,
      });
    },

    // ------------------------------------------------------------ alertas
    async alertas(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return { igreja: church, alertas: await repo.alertas(church.id) };
    },

    async justificativasLongas(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return { igreja: church, longas: await repo.justificativasLongas(church.id) };
    },

    async registrarContato(actor: AcompanhamentoActor, input: unknown) {
      const church = await igreja(actor);
      const dados = validar(contatoSchema, input);
      if (dados.data > hoje()) throw new AppError("validation_error", "A data do contato não pode ser futura.");
      await exigeMembro(church.id, dados.membroId);
      await repo.registrarContato(church.id, dados);
    },

    // ------------------------------------------------- relatórios / resumo
    /** Só as chamadas do período (presentes/ausentes por culto), para o gráfico do painel. */
    async chamadasDoPeriodo(actor: AcompanhamentoActor, periodo: { de: string; ate: string }) {
      const church = await igreja(actor);
      const { de, ate } = validar(periodoSchema, periodo);
      return repo.relatorioChamadas(church.id, de, ate);
    },

    async relatorio(actor: AcompanhamentoActor, periodo: { de: string; ate: string }) {
      const church = await igreja(actor);
      const { de, ate } = validar(periodoSchema, periodo);
      if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 > 731) {
        throw new AppError("validation_error", "Escolha um período de até dois anos.");
      }
      const [chamadas, frequencia] = await Promise.all([
        repo.relatorioChamadas(church.id, de, ate),
        repo.frequencia(church.id, de, ate),
      ]);
      return { chamadas, frequencia };
    },

    async resumo(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return repo.resumo(church.id);
    },

    /** Só números das igrejas abaixo. Owner/admin; a RPC confere a árvore de novo. */
    async resumoRede(actor: Pick<AcompanhamentoActor, "companyId" | "role">) {
      if (!canVerResumoRede(actor.role)) return [];
      const church = await repo.getChurch(actor.companyId);
      if (!church) return [];
      return repo.resumoRede(church.id);
    },

    // ------------------------------------------------------ configuração
    async getConfig(actor: AcompanhamentoActor) {
      const church = await igreja(actor);
      return repo.getConfig(church.id);
    },

    async salvarConfig(actor: AcompanhamentoActor, input: unknown) {
      if (!canConfigurar(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja muda as regras do alerta.");
      }
      const church = await igreja(actor);
      const dados = validar(configSchema, input);
      await repo.saveConfig(church.id, dados);
    },
  };
}

export type AcompanhamentoService = ReturnType<typeof createAcompanhamentoService>;
