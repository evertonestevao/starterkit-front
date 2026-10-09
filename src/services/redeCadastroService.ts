import { z } from "zod";
import { passwordSchema } from "@/features/auth/schemas";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import { slugify } from "./tenantService";
import { linhaDoEndereco, type PartesDoEndereco } from "@/lib/enderecoDaIgreja";

/**
 * A igreja de cima cadastra as de baixo, e a pessoa convidada assume.
 *
 * A igreja cadastrada nasce ligada e SEM DONO ("aguardando responsável"):
 * quem cadastrou nunca vira dono dela (a de cima não lê os dados da de
 * baixo). O convite para assumir é um link pessoal — o banco guarda só o
 * hash — com prazo, que só vale para o e-mail convidado. Como muitos
 * pastores não usam e-mail, o link vai também pelo WhatsApp e por QR Code, e
 * quem ainda não tem conta cria só a senha na hora (o link prova que é ele).
 *
 * As regras de quem pode o quê estão no banco (pode_gerir_igreja_abaixo,
 * aceitar_responsavel); aqui ficam a validação e as mensagens.
 */

export interface RedeCadastroActor {
  companyId: string;
  role: RoleCode;
  /** Permissão "Cadastrar igrejas na rede" liberada por um cargo da pessoa. */
  liberado: boolean;
  userId: string;
}

export function podeCadastrarNaRede(role: RoleCode, liberado: boolean): boolean {
  return role === "owner" || role === "admin" || liberado;
}

export type TipoCadastrado = "subsede" | "congregacao";
export type CargoDeResponsavel = "pastor" | "secretario";

export interface IgrejaAguardando {
  churchId: string;
  nome: string;
  /** O nome que se edita (o efetivo pode vir da igreja de cima). */
  nomeProprio: string;
  sobrenome: string | null;
  sobre: string | null;
  endereco: PartesDoEndereco;
  tipo: TipoCadastrado;
  criadaEm: string;
  convite: { nome: string; email: string; expiraEm: string } | null;
}

export type EstadoConvite = "valido" | "usado" | "substituido" | "expirado";

export interface ConviteResponsavel {
  estado: EstadoConvite;
  igreja: string;
  tipo: string;
  mae: string | null;
  /** Só enquanto o link vale. */
  email: string | null;
  nome: string;
}

export interface RedeCadastroRepository {
  cadastrar(input: { maeId: string; tipo: TipoCadastrado; nome: string; sobrenome: string | null; slug: string }): Promise<string>;
  convidar(input: {
    churchId: string;
    tokenHash: string;
    email: string;
    nome: string;
    cargo: CargoDeResponsavel | null;
    whatsapp: string | null;
    validadeHoras: number;
  }): Promise<string>;
  aguardando(maeId: string): Promise<IgrejaAguardando[]>;
  /** Só enquanto a igreja aguarda responsável (o banco confere). */
  editar(churchId: string, dados: {
    nome: string;
    sobrenome: string | null;
    sobre: string | null;
    endereco: PartesDoEndereco;
    address: string | null;
  }): Promise<void>;
  consultarConvite(token: string): Promise<ConviteResponsavel | null>;
  /** Logado com o e-mail do convite: vira Responsável. */
  aceitar(token: string): Promise<{ companyId: string; igreja: string }>;
}

/** O que só o servidor (service_role) faz no primeiro acesso de quem não tem conta. */
export interface ContasDoServidor {
  contaExiste(email: string): Promise<boolean>;
  /** Cria a conta já confirmada (o link do convite prova que é a pessoa). */
  criarConta(input: { email: string; senha: string; nome: string }): Promise<void>;
  /** Entra com a conta recém-criada (grava a sessão no navegador dela). */
  entrar(email: string, senha: string): Promise<void>;
}

/** Validade do link para assumir: 7 dias. */
export const VALIDADE_CONVITE_HORAS = 168;

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const cadastroSchema = z.object({
  maeId: z.uuid("Igreja inválida"),
  tipo: z.enum(["subsede", "congregacao"], "Escolha se é subsede ou congregação"),
  nome: z.string().trim().min(2, "Informe o nome da igreja").max(120, "Nome muito longo"),
  sobrenome: z
    .string()
    .trim()
    .max(120, "Complemento muito longo")
    .nullable()
    .transform((v) => v || null),
});

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Texto longo demais")
    .nullable()
    .transform((v) => v || null);

const edicaoSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  nome: z.string().trim().min(2, "Informe o nome da igreja").max(120, "Nome muito longo"),
  sobrenome: textoOpcional(120),
  sobre: textoOpcional(1500),
  endereco: z.object({
    cep: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || v.length === 8, "O CEP tem 8 números")
      .transform((v) => v || null),
    logradouro: textoOpcional(150),
    numero: textoOpcional(20),
    complemento: textoOpcional(80),
    bairro: textoOpcional(80),
    cidade: textoOpcional(80),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "Escolha a UF")
      .transform((v) => v || null),
  }),
});

const conviteSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  nome: z.string().trim().min(2, "Informe o nome de quem vai assumir").max(120, "Nome muito longo"),
  email: z.string().trim().toLowerCase().max(254, "E-mail longo demais").pipe(z.email("E-mail inválido")),
  cargo: z.enum(["pastor", "secretario"]).nullable(),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Informe o WhatsApp com DDD")
    .nullable()
    .transform((v) => v || null),
});

export function createRedeCadastroService(deps: {
  repo: RedeCadastroRepository;
  tokens: { make(): string; hash(token: string): string };
  appUrl: string;
  /** Sufixo para slug repetido (testes passam um fixo). */
  sufixo?: () => string;
}) {
  const { repo } = deps;
  const base = deps.appUrl.replace(/\/+$/, "");
  const sufixo = deps.sufixo ?? (() => Math.random().toString(36).slice(2, 7));

  function exige(actor: RedeCadastroActor) {
    if (!podeCadastrarNaRede(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Você não tem permissão para cadastrar igrejas na rede.");
    }
  }

  return {
    /** Cadastra a igreja de baixo. Devolve o id da igreja nova. */
    async cadastrar(actor: RedeCadastroActor, input: unknown): Promise<string> {
      exige(actor);
      const parsed = cadastroSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;
      const base = slugify([dados.nome, dados.sobrenome].filter(Boolean).join(" "));
      // Slug repetido: tenta de novo com sufixo (mesmo jeito do cadastro normal).
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          return await repo.cadastrar({ ...dados, slug: tentativa === 0 ? base : `${base}-${sufixo()}` });
        } catch (err) {
          if (!(err instanceof AppError && err.code === "conflict") || tentativa === 2) throw err;
        }
      }
      throw new AppError("internal_error", "Não foi possível cadastrar a igreja.");
    },

    /** Prepara a página enquanto ninguém assumiu. */
    async editar(actor: RedeCadastroActor, input: unknown): Promise<void> {
      exige(actor);
      const parsed = edicaoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, endereco, ...resto } = parsed.data;
      await repo.editar(churchId, { ...resto, endereco, address: linhaDoEndereco(endereco) });
    },

    async aguardando(actor: RedeCadastroActor, maeId: string): Promise<IgrejaAguardando[]> {
      exige(actor);
      if (!z.uuid().safeParse(maeId).success) return [];
      return repo.aguardando(maeId);
    },

    /**
     * Gera o convite (o anterior deixa de valer) e devolve o link — que só
     * aparece agora: o banco guarda o hash.
     */
    async convidar(
      actor: RedeCadastroActor,
      input: unknown,
    ): Promise<{ link: string; expiraEm: string; nome: string; whatsapp: string | null }> {
      exige(actor);
      const parsed = conviteSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;
      const token = deps.tokens.make();
      const expiraEm = await repo.convidar({
        churchId: dados.churchId,
        tokenHash: deps.tokens.hash(token),
        email: dados.email,
        nome: dados.nome,
        cargo: dados.cargo,
        whatsapp: dados.whatsapp,
        validadeHoras: VALIDADE_CONVITE_HORAS,
      });
      return { link: `${base}/assumir/${token}`, expiraEm, nome: dados.nome, whatsapp: dados.whatsapp };
    },
  };
}

export type RedeCadastroService = ReturnType<typeof createRedeCadastroService>;

/** A página do link (sem login para abrir). */
export function createAssumirService(deps: { repo: RedeCadastroRepository; contas: ContasDoServidor }) {
  const { repo, contas } = deps;

  async function conviteValido(token: unknown): Promise<ConviteResponsavel & { email: string }> {
    if (!tokenSchema.safeParse(token).success) throw new AppError("not_found", "Este link não vale.");
    const convite = await repo.consultarConvite(token as string);
    if (!convite || convite.estado !== "valido" || !convite.email) {
      throw new AppError("not_found", "Este convite não vale mais. Peça um novo a quem cadastrou a igreja.");
    }
    return convite as ConviteResponsavel & { email: string };
  }

  return {
    /** O que o link mostra, e se o e-mail convidado já tem conta (decide entre "entrar" e "criar senha"). */
    async consultar(token: unknown): Promise<(ConviteResponsavel & { contaExiste: boolean }) | null> {
      if (!tokenSchema.safeParse(token).success) return null;
      const convite = await repo.consultarConvite(token as string);
      if (!convite) return null;
      return { ...convite, contaExiste: convite.email ? await contas.contaExiste(convite.email) : false };
    },

    /** Já logado (com o e-mail do convite — o banco confere). */
    async assumir(token: unknown): Promise<{ companyId: string; igreja: string }> {
      if (!tokenSchema.safeParse(token).success) throw new AppError("not_found", "Este link não vale.");
      return repo.aceitar(token as string);
    },

    /**
     * Primeiro acesso: cria a conta do e-mail convidado com a senha que a
     * pessoa escolheu, entra e assume. Só quando o convite vale e o e-mail
     * ainda não tem conta — quem já tem precisa entrar com a própria senha.
     */
    async criarContaEAssumir(token: unknown, input: { nome: unknown; senha: unknown }): Promise<{ companyId: string; igreja: string }> {
      const convite = await conviteValido(token);
      const nome = z.string().trim().min(2, "Informe o seu nome").max(120).safeParse(input.nome);
      if (!nome.success) throw toValidationError(nome.error.issues.map((i) => ({ ...i, path: ["nome"] })));
      const senha = passwordSchema.safeParse(input.senha);
      if (!senha.success) throw toValidationError(senha.error.issues.map((i) => ({ ...i, path: ["senha"] })));
      if (await contas.contaExiste(convite.email)) {
        throw new AppError("conflict", "Este e-mail já tem conta. Entre com a sua senha para assumir.");
      }
      await contas.criarConta({ email: convite.email, senha: senha.data, nome: nome.data });
      await contas.entrar(convite.email, senha.data);
      return repo.aceitar(token as string);
    },
  };
}

export type AssumirService = ReturnType<typeof createAssumirService>;
