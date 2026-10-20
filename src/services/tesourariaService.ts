import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import { FORMAS, TIPOS, intervaloDoMes } from "@/lib/tesouraria";
import type { RoleCode } from "@/types/database";
import type { CultoOpcao, Lancamento, LancamentoInput, PessoaTesouraria } from "@/types/tesouraria";

/**
 * Tesouraria: dízimos e ofertas dos cultos. Um lançamento por entrada, com
 * relatório mensal — não é um financeiro. A oferta da EBD é outro caixa e
 * fica na própria EBD.
 *
 * Quem usa: quem administra a igreja ou tem o módulo "tesouraria" liberado
 * pelo cargo. O banco repete a regra (`tem_acesso`), e só para a própria igreja.
 */

export interface TesourariaActor {
  companyId: string;
  role: RoleCode;
  /** Módulo "tesouraria" liberado por um cargo da pessoa. */
  liberado: boolean;
}

export function canTesouraria(role: RoleCode, liberado: boolean): boolean {
  return role === "owner" || role === "admin" || liberado;
}

export interface TesourariaRepository {
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  /** Lançamentos da igreja entre as datas (inclusive), do mais novo para o mais antigo. */
  listar(churchId: string, de: string, ate: string): Promise<Lancamento[]>;
  salvar(churchId: string, id: string | null, input: LancamentoInput): Promise<string>;
  excluir(id: string): Promise<void>;
  cultos(churchId: string): Promise<CultoOpcao[]>;
  buscarPessoas(churchId: string, termo: string): Promise<PessoaTesouraria[]>;
}

/** R$ 1.000.000,00: acima disso é erro de digitação, não dízimo. */
const VALOR_MAXIMO = 100_000_000;

const textoOpcional = (max: number, mensagem: string) =>
  z
    .string()
    .trim()
    .max(max, mensagem)
    .nullish()
    .transform((v) => v || null);

function lancamentoSchema(hoje: string) {
  return z.object({
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data")
      .refine((d) => !Number.isNaN(Date.parse(d)), "Data inválida")
      // Lançar culto que ainda não aconteceu é quase sempre o ano errado.
      .refine((d) => d <= hoje, "A data não pode ser no futuro"),
    scheduleId: z
      .uuid("Culto inválido")
      .nullish()
      .transform((v) => v ?? null),
    tipo: z.enum(TIPOS as [string, ...string[]], "Escolha dízimo ou oferta"),
    valorCentavos: z
      .number("Informe o valor")
      .int("Valor inválido")
      .positive("Informe um valor maior que zero")
      .max(VALOR_MAXIMO, "Valor alto demais. Confira os centavos."),
    forma: z.enum(FORMAS as [string, ...string[]], "Forma de recebimento inválida"),
    membroId: z
      .uuid("Pessoa inválida")
      .nullish()
      .transform((v) => v ?? null),
    nome: textoOpcional(120, "Nome longo demais").refine((v) => v === null || v.length >= 2, "Nome curto demais"),
    observacao: textoOpcional(300, "Observação longa demais"),
  });
}

export function createTesourariaService(deps: { repo: TesourariaRepository; hoje: () => string }) {
  const { repo, hoje } = deps;

  function exige(actor: TesourariaActor) {
    if (!canTesouraria(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Você não tem acesso à tesouraria desta igreja.");
    }
  }

  async function igreja(actor: TesourariaActor) {
    exige(actor);
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Igreja não encontrada.");
    return church;
  }

  return {
    /** Tudo o que foi lançado no mês "AAAA-MM". */
    async doMes(
      actor: TesourariaActor,
      mes: string,
    ): Promise<{ igreja: { id: string; name: string }; lancamentos: Lancamento[] }> {
      const church = await igreja(actor);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new AppError("validation_error", "Mês inválido");
      const { de, ate } = intervaloDoMes(mes);
      return { igreja: church, lancamentos: await repo.listar(church.id, de, ate) };
    },

    /** Cultos da programação, para escolher no lançamento. */
    async cultos(actor: TesourariaActor): Promise<CultoOpcao[]> {
      const church = await igreja(actor);
      return repo.cultos(church.id);
    },

    /** Novo (`id` nulo) ou edição. Dízimo com membro escolhido usa o nome do rol. */
    async salvar(actor: TesourariaActor, id: string | null, input: unknown): Promise<string> {
      const church = await igreja(actor);
      if (id !== null && !z.uuid().safeParse(id).success) throw new AppError("not_found", "Lançamento não encontrado.");
      const parsed = lancamentoSchema(hoje()).safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data as LancamentoInput;
      // Oferta é do culto, não de uma pessoa: não guarda nome.
      const limpo: LancamentoInput = dados.tipo === "oferta" ? { ...dados, membroId: null, nome: null } : dados;
      return repo.salvar(church.id, id, limpo);
    },

    async excluir(actor: TesourariaActor, id: string): Promise<void> {
      exige(actor);
      if (!z.uuid().safeParse(id).success) throw new AppError("not_found", "Lançamento não encontrado.");
      await repo.excluir(id);
    },

    /** Sugestões de nome enquanto se digita o dizimista (a partir de 2 letras). */
    async buscarPessoas(actor: TesourariaActor, termo: unknown): Promise<PessoaTesouraria[]> {
      const church = await igreja(actor);
      const texto = typeof termo === "string" ? termo.trim().slice(0, 80) : "";
      if (texto.length < 2) return [];
      return repo.buscarPessoas(church.id, texto);
    },
  };
}

export type TesourariaService = ReturnType<typeof createTesourariaService>;
