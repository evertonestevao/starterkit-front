import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type {
  EbdListaDaIgreja,
  EbdRevistasDoTrimestre,
  EbdRevistasRede,
  FormaDePagamentoDaRevista,
} from "@/types/ebdRevistas";
import { canGerirEbd } from "./ebdService";

/**
 * EBD → Revistas: pedidos de revista por trimestre, com pagamento (pode ser
 * em partes) e entrega. Só a gestão da EBD da própria igreja; o banco confere
 * de novo em cada função (can_gerir_ebd) e é ele quem grava.
 */

export interface EbdRevistasActor {
  role: RoleCode;
  podeGerirEbd: boolean;
}

export interface EbdRevistasRepository {
  /** null = quem pede não é da gestão da EBD desta igreja. */
  listaDaIgreja(churchId: string): Promise<EbdListaDaIgreja | null>;
  /** Pedidos desta igreja no trimestre (da lista dela). null = sem acesso. */
  doTrimestre(trimestreId: string, churchId: string): Promise<EbdRevistasDoTrimestre | null>;
  /** Só a igreja dona da lista. null = sem acesso. */
  rede(trimestreId: string): Promise<EbdRevistasRede | null>;
  salvarExterno(input: {
    id: string | null;
    trimestreId: string;
    nome: string;
    itens: Array<{ revistaId: string; quantidade: number }>;
  }): Promise<string>;
  removerExterno(id: string): Promise<void>;
  salvarRevista(input: {
    id: string | null;
    trimestreId: string;
    titulo: string;
    precoCentavos: number;
    classeId: string | null;
  }): Promise<string>;
  removerRevista(id: string): Promise<void>;
  copiarRevistas(deTrimestreId: string, paraTrimestreId: string): Promise<number>;
  salvarPedido(input: {
    id: string | null;
    trimestreId: string;
    /** A igreja dos pedidos (a congregação usa o trimestre da igreja de cima). */
    churchId: string;
    membroId: string | null;
    nome: string | null;
    telefone: string | null;
    observacao: string | null;
    itens: Array<{ revistaId: string; quantidade: number }>;
  }): Promise<string>;
  registrarPagamento(input: {
    pedidoId: string;
    valorCentavos: number;
    data: string;
    forma: FormaDePagamentoDaRevista;
  }): Promise<string>;
  estornarPagamento(pagamentoId: string): Promise<void>;
  marcarEntrega(pedidoId: string, entregue: boolean): Promise<void>;
  cancelarPedido(pedidoId: string): Promise<void>;
}

const id = (mensagem: string) => z.uuid(mensagem);
const vazioViraNull = (v: string) => (v === "" ? null : v);

/** "12,50", "12.5" ou "12" viram centavos. */
const centavos = (mensagem: string) =>
  z
    .string()
    .trim()
    .transform((v) =>
      v
        .replace(/^R\$\s*/i, "")
        .replace(/\./g, (ponto, pos, s) => (s.indexOf(",") >= 0 ? "" : ponto))
        .replace(",", "."),
    )
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), mensagem)
    .transform((v) => Math.round(Number(v) * 100));

const revistaSchema = z.object({
  id: z.string().trim().transform(vazioViraNull).pipe(id("Revista inválida").nullable()),
  trimestreId: id("Escolha o trimestre"),
  titulo: z.string().trim().min(2, "Informe o título da revista").max(80, "Título longo demais"),
  precoCentavos: centavos("Informe o preço (ex.: 12,50)").pipe(z.number().max(1_000_000, "Preço alto demais")),
  classeId: z.string().trim().transform(vazioViraNull).pipe(id("Classe inválida").nullable()),
});

const pedidoSchema = z
  .object({
    id: z.string().trim().transform(vazioViraNull).pipe(id("Pedido inválido").nullable()),
    trimestreId: id("Escolha o trimestre"),
    membroId: z.string().trim().transform(vazioViraNull).pipe(id("Pessoa inválida").nullable()),
    nome: z.string().trim().max(120, "Nome longo demais").transform(vazioViraNull),
    telefone: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone com DDD, por favor")
      .transform(vazioViraNull),
    observacao: z.string().trim().max(300, "Observação longa demais").transform(vazioViraNull),
    itens: z
      .array(
        z.object({
          revistaId: id("Revista inválida"),
          quantidade: z.coerce.number().int().min(1, "Quantidade mínima: 1").max(200, "Quantidade alta demais"),
        }),
      )
      .min(1, "Escolha pelo menos uma revista")
      .max(30, "Revistas demais num pedido só"),
  })
  .refine((p) => p.id !== null || p.membroId !== null || (p.nome !== null && p.nome.length >= 2), {
    message: "Escolha a pessoa ou informe o nome",
    path: ["nome"],
  })
  .refine((p) => new Set(p.itens.map((i) => i.revistaId)).size === p.itens.length, {
    message: "A mesma revista apareceu duas vezes",
    path: ["itens"],
  });

const pedidoExternoSchema = z.object({
  id: z.string().trim().transform(vazioViraNull).pipe(id("Pedido inválido").nullable()),
  trimestreId: id("Escolha o trimestre"),
  nome: z.string().trim().min(2, "Informe o nome da congregação").max(120, "Nome longo demais"),
  itens: z
    .array(
      z.object({
        revistaId: id("Revista inválida"),
        quantidade: z.coerce.number().int().min(1, "Quantidade mínima: 1").max(2000, "Quantidade alta demais"),
      }),
    )
    .min(1, "Informe a quantidade de pelo menos uma revista")
    .max(60, "Revistas demais"),
});

const pagamentoSchema = z.object({
  pedidoId: id("Pedido inválido"),
  valorCentavos: centavos("Informe o valor (ex.: 10,00)").pipe(
    z.number().min(1, "Informe o valor pago").max(10_000_000, "Valor alto demais"),
  ),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento"),
  forma: z.enum(["dinheiro", "pix", "outro"]),
});

export function createEbdRevistasService(deps: { repo: EbdRevistasRepository }) {
  const { repo } = deps;

  function exige(actor: EbdRevistasActor) {
    if (!canGerirEbd(actor.role, actor.podeGerirEbd)) {
      throw new AppError("forbidden", "Só a secretaria da EBD cuida dos pedidos de revista.");
    }
  }

  function validar<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw toValidationError(parsed.error.issues);
    return parsed.data;
  }

  const idValido = (valor: unknown, oQue: string): string => {
    const parsed = z.uuid().safeParse(valor);
    if (!parsed.success) throw new AppError("not_found", `${oQue} não encontrado.`);
    return parsed.data;
  };

  return {
    /** De quem é a lista de revistas desta igreja, e os trimestres dela. */
    async listaDaIgreja(actor: EbdRevistasActor, churchId: string): Promise<EbdListaDaIgreja> {
      exige(actor);
      const lista = await repo.listaDaIgreja(idValido(churchId, "Igreja"));
      if (!lista) throw new AppError("not_found", "Igreja não encontrada.");
      return lista;
    },

    async doTrimestre(
      actor: EbdRevistasActor,
      trimestreId: unknown,
      churchId: string,
    ): Promise<EbdRevistasDoTrimestre> {
      exige(actor);
      const dados = await repo.doTrimestre(idValido(trimestreId, "Trimestre"), idValido(churchId, "Igreja"));
      if (!dados) throw new AppError("not_found", "Trimestre não encontrado.");
      return dados;
    },

    /** Aba Rede: quanto cada igreja pediu de cada revista (só a igreja que faz a compra). */
    async rede(actor: EbdRevistasActor, trimestreId: unknown): Promise<EbdRevistasRede> {
      exige(actor);
      const dados = await repo.rede(idValido(trimestreId, "Trimestre"));
      if (!dados) throw new AppError("not_found", "Trimestre não encontrado.");
      return dados;
    },

    /** Pedido de uma congregação fora do sistema: só as quantidades. */
    async salvarExterno(actor: EbdRevistasActor, input: unknown): Promise<string> {
      exige(actor);
      const dados = validar(pedidoExternoSchema, input);
      if (new Set(dados.itens.map((i) => i.revistaId)).size !== dados.itens.length) {
        throw new AppError("validation_error", "A mesma revista apareceu duas vezes.");
      }
      return repo.salvarExterno(dados);
    },

    async removerExterno(actor: EbdRevistasActor, pedidoId: unknown): Promise<void> {
      exige(actor);
      await repo.removerExterno(idValido(pedidoId, "Pedido"));
    },

    async salvarRevista(actor: EbdRevistasActor, input: unknown): Promise<string> {
      exige(actor);
      return repo.salvarRevista(validar(revistaSchema, input));
    },

    async removerRevista(actor: EbdRevistasActor, revistaId: unknown): Promise<void> {
      exige(actor);
      await repo.removerRevista(idValido(revistaId, "Revista"));
    },

    /** Traz as revistas (título, preço e classe) de outro trimestre que ainda não existem neste. */
    async copiarRevistas(actor: EbdRevistasActor, deTrimestreId: unknown, paraTrimestreId: unknown): Promise<number> {
      exige(actor);
      const de = idValido(deTrimestreId, "Trimestre");
      const para = idValido(paraTrimestreId, "Trimestre");
      if (de === para) throw new AppError("validation_error", "Escolha outro trimestre para copiar.");
      return repo.copiarRevistas(de, para);
    },

    /** `churchId`: a igreja de quem pede, vinda da sessão (nunca do formulário). */
    async salvarPedido(actor: EbdRevistasActor, input: unknown, churchId: string): Promise<string> {
      exige(actor);
      return repo.salvarPedido({ ...validar(pedidoSchema, input), churchId: idValido(churchId, "Igreja") });
    },

    async registrarPagamento(actor: EbdRevistasActor, input: unknown): Promise<string> {
      exige(actor);
      return repo.registrarPagamento(validar(pagamentoSchema, input));
    },

    async estornarPagamento(actor: EbdRevistasActor, pagamentoId: unknown): Promise<void> {
      exige(actor);
      await repo.estornarPagamento(idValido(pagamentoId, "Pagamento"));
    },

    async marcarEntrega(actor: EbdRevistasActor, pedidoId: unknown, entregue: boolean): Promise<void> {
      exige(actor);
      await repo.marcarEntrega(idValido(pedidoId, "Pedido"), entregue === true);
    },

    async cancelarPedido(actor: EbdRevistasActor, pedidoId: unknown): Promise<void> {
      exige(actor);
      await repo.cancelarPedido(idValido(pedidoId, "Pedido"));
    },
  };
}

export type EbdRevistasService = ReturnType<typeof createEbdRevistasService>;
