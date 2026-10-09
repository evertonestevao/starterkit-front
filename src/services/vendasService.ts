import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import { buildPixPayload } from "@/lib/pixPayload";
import type { RoleCode } from "@/types/database";
import { normalizarCodigoVoucher } from "@/lib/vendas";
import type {
  PedidoVenda,
  StatusPedido,
  StatusVenda,
  Venda,
  VendaInput,
  VendaPublica,
  VoucherPublico,
} from "@/types/vendas";
import { detectPixKeyKind, maskPixKey, VALIDADE_CONFIRMACAO_HORAS } from "./churchPixService";

/**
 * Vendas antecipadas: camiseta do congresso, pastel, lanche. Quem organiza
 * cria a venda com preço fixo e o Pix de quem recebe — não é dinheiro da
 * igreja, não entra na Tesouraria. Quem compra escolhe a quantidade pela
 * página e paga o Pix; a confirmação é manual, no painel.
 *
 * A chave Pix vai para a página pública, então segue a regra da chave da
 * igreja: a venda só aparece depois que o Responsável confirma a chave pelo
 * e-mail. Uma sessão roubada não publica um Pix sozinha.
 *
 * Quem usa: quem administra a igreja ou tem o módulo "vendas" liberado pelo
 * cargo. O banco repete a regra (`tem_acesso`).
 */

export interface VendasActor {
  companyId: string;
  role: RoleCode;
  /** Módulo "vendas" liberado por um cargo da pessoa. */
  liberado: boolean;
  userId: string;
  email: string;
}

export function canVendas(role: RoleCode, liberado: boolean): boolean {
  return role === "owner" || role === "admin" || liberado;
}

export interface VendasRepository {
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  listar(churchId: string): Promise<Venda[]>;
  buscar(churchId: string, id: string): Promise<Venda | null>;
  /** Devolve o id e se a chave precisa de confirmação (nova ou trocada). */
  salvar(churchId: string, id: string | null, input: VendaInput): Promise<{ id: string; precisaConfirmar: boolean }>;
  definirStatus(id: string, status: StatusVenda): Promise<void>;
  excluir(id: string): Promise<void>;
  pedidos(vendaIds: string[]): Promise<PedidoVenda[]>;
  marcarPedido(pedidoId: string, status: StatusPedido): Promise<void>;
  /** Entregue (com observação) ou desfaz a entrega. */
  marcarEntrega(pedidoId: string, entregue: boolean, obs: string | null): Promise<void>;
  /** Pedidos da igreja com este código curto (pode haver o mesmo código em vendas diferentes). */
  pedidosPorCodigo(churchId: string, codigo: string): Promise<Array<{ pedido: PedidoVenda; venda: Venda }>>;
  /** O pedido do link do voucher, se for desta igreja (pela RLS). */
  pedidoPorVoucherHash(hash: string): Promise<{ pedido: PedidoVenda; venda: Venda } | null>;
  /** Nome de quem marcou a entrega. */
  quemEntregou(pedidoId: string): Promise<string | null>;
  /** Grava o pedido de confirmação (só o hash) e devolve o e-mail do Responsável. Roda com service_role. */
  criarConfirmacao(input: {
    vendaId: string;
    tokenHash: string;
    solicitadoPor: string;
    validadeHoras: number;
  }): Promise<string[]>;
}

export interface VendasNotifier {
  sendVendaPixConfirmation(input: {
    to: string[];
    churchName: string;
    titulo: string;
    chaveMascarada: string;
    titular: string;
    /** WhatsApp do comprovante, quando a venda pede. */
    whatsapp: string | null;
    alteradoPor: string;
    token: string;
    validadeHoras: number;
  }): Promise<void>;
}

export interface VendasAuditRecorder {
  record(input: {
    companyId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

/** R$ 100.000,00 por unidade: acima disso é erro de digitação. */
const PRECO_MAXIMO = 10_000_000;

const inteiroOpcional = (min: number, max: number, mensagem: string) =>
  z
    .number()
    .int(mensagem)
    .min(min, mensagem)
    .max(max, mensagem)
    .nullable();

function vendaSchema(hoje: string) {
  return z.object({
    titulo: z.string().trim().min(2, "Informe o nome do que está à venda").max(120, "Nome longo demais"),
    descricao: z
      .string()
      .trim()
      .max(2000, "Descrição longa demais")
      .nullable()
      .transform((v) => v || null),
    precoCents: z
      .number("Informe o valor")
      .int("Valor inválido")
      .positive("Informe um valor maior que zero")
      .max(PRECO_MAXIMO, "Valor alto demais. Confira os centavos."),
    pixChave: z.string().trim().min(5, "Chave Pix incompleta. Use CPF, CNPJ, e-mail, celular com +55 ou chave aleatória.").max(140, "Chave Pix longa demais"),
    pixTitular: z.string().trim().min(3, "Informe o nome de quem recebe").max(140, "Nome longo demais"),
    // Só dígitos: DDD + número (com ou sem o 55).
    whatsappComprovante: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Informe o WhatsApp com DDD")
      .nullable()
      .transform((v) => v || null),
    encerraEm: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
      .refine((d) => d >= hoje, "A data de encerramento já passou")
      .nullable(),
    estoque: inteiroOpcional(1, 100_000, "Estoque inválido"),
    maxPorPedido: inteiroOpcional(1, 1000, "Máximo por pedido inválido"),
    temOpcoes: z.boolean(),
    geraVoucher: z.boolean(),
    opcoes: z
      .array(
        z.object({
          id: z.uuid("Opção inválida").nullable(),
          nome: z.string().trim().min(1, "Dê um nome a cada opção").max(80, "Nome de opção longo demais"),
          precoCents: z
            .number()
            .int("Valor inválido")
            .positive("Valor da opção inválido")
            .max(PRECO_MAXIMO, "Valor alto demais. Confira os centavos.")
            .nullable(),
        }),
      )
      .max(40, "No máximo 40 opções"),
  })
  .superRefine((v, ctx) => {
    if (!v.temOpcoes) return;
    if (v.opcoes.length === 0) ctx.addIssue({ code: "custom", path: ["opcoes"], message: "Cadastre pelo menos uma opção" });
    const nomes = v.opcoes.map((o) => o.nome.toLowerCase());
    if (new Set(nomes).size !== nomes.length) {
      ctx.addIssue({ code: "custom", path: ["opcoes"], message: "Há duas opções com o mesmo nome" });
    }
  });
}

const pedidoPublicoSchema = z.object({
  vendaId: z.uuid("Venda não encontrada"),
  nome: z.string().trim().min(2, "Informe seu nome").max(120, "Nome longo demais"),
  telefone: z.string().trim().min(8, "Informe seu WhatsApp").max(20, "WhatsApp inválido"),
  // Sem opções: a quantidade. Com opções: a quantidade de cada uma (o banco confere qual vale).
  quantidade: z.number().int("Quantidade inválida").min(0).max(1000),
  itens: z
    .array(z.object({ opcaoId: z.uuid("Opção inválida"), quantidade: z.number().int().min(0).max(1000) }))
    .max(40),
  observacao: z
    .string()
    .trim()
    .max(500, "Observação longa demais")
    .nullable()
    .transform((v) => v || null),
}).refine((p) => p.quantidade > 0 || p.itens.some((i) => i.quantidade > 0), "Escolha pelo menos uma unidade");

export function createVendasService(deps: {
  repo: VendasRepository;
  hoje: () => string;
  notifier?: VendasNotifier;
  tokens?: { make(): string; hash(token: string): string };
  audit?: VendasAuditRecorder;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const { repo } = deps;
  const log = deps.log ?? console;

  function exige(actor: VendasActor) {
    if (!canVendas(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Você não tem acesso às vendas desta igreja.");
    }
  }

  async function igreja(actor: VendasActor) {
    exige(actor);
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Igreja não encontrada.");
    return church;
  }

  async function vendaDaIgreja(actor: VendasActor, id: string) {
    const church = await igreja(actor);
    if (!z.uuid().safeParse(id).success) throw new AppError("not_found", "Venda não encontrada.");
    const venda = await repo.buscar(church.id, id);
    if (!venda) throw new AppError("not_found", "Venda não encontrada.");
    return { church, venda };
  }

  /** Manda o link ao Responsável. Devolve se o e-mail saiu (a venda já está salva de qualquer jeito). */
  async function pedirConfirmacao(
    actor: VendasActor,
    churchName: string,
    venda: Pick<Venda, "id" | "titulo" | "pixChave" | "pixTitular" | "whatsappComprovante">,
  ) {
    if (!deps.tokens || !deps.notifier) return false;
    try {
      const token = deps.tokens.make();
      const responsaveis = await repo.criarConfirmacao({
        vendaId: venda.id,
        tokenHash: deps.tokens.hash(token),
        solicitadoPor: actor.userId,
        validadeHoras: VALIDADE_CONFIRMACAO_HORAS,
      });
      if (responsaveis.length === 0) return false;
      await deps.notifier.sendVendaPixConfirmation({
        to: responsaveis,
        churchName,
        titulo: venda.titulo,
        chaveMascarada: maskPixKey(venda.pixChave),
        titular: venda.pixTitular,
        whatsapp: venda.whatsappComprovante,
        alteradoPor: actor.email,
        token,
        validadeHoras: VALIDADE_CONFIRMACAO_HORAS,
      });
      return true;
    } catch (err) {
      log.error("[vendas] falha ao enviar o link de confirmação", err);
      return false;
    }
  }

  return {
    async listar(actor: VendasActor): Promise<{ vendas: Venda[]; pedidos: PedidoVenda[] }> {
      const church = await igreja(actor);
      const vendas = await repo.listar(church.id);
      return { vendas, pedidos: vendas.length ? await repo.pedidos(vendas.map((v) => v.id)) : [] };
    },

    async detalhe(actor: VendasActor, id: string): Promise<{ venda: Venda; pedidos: PedidoVenda[] }> {
      const { venda } = await vendaDaIgreja(actor, id);
      return { venda, pedidos: await repo.pedidos([venda.id]) };
    },

    /**
     * Nova venda (`id` nulo) ou edição. Chave nova ou trocada: a venda sai da
     * página até o Responsável confirmar, e o link é enviado na hora.
     */
    async salvar(
      actor: VendasActor,
      id: string | null,
      input: unknown,
    ): Promise<{ id: string; precisaConfirmar: boolean; confirmacaoEnviada: boolean }> {
      const church = await igreja(actor);
      if (id !== null) await vendaDaIgreja(actor, id);
      const parsed = vendaSchema(deps.hoje()).safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data as VendaInput;
      if (!detectPixKeyKind(dados.pixChave)) {
        throw new AppError(
          "validation_error",
          "Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone com +55 ou chave aleatória.",
          undefined,
          "pixChave",
        );
      }
      if (dados.estoque !== null && dados.maxPorPedido !== null && dados.maxPorPedido > dados.estoque) {
        throw new AppError("validation_error", "O máximo por pedido não pode passar do estoque.", undefined, "maxPorPedido");
      }

      const salvo = await repo.salvar(church.id, id, dados);
      let confirmacaoEnviada = false;
      if (salvo.precisaConfirmar) {
        await deps.audit
          ?.record({
            companyId: actor.companyId,
            userId: actor.userId,
            action: id ? "venda.pix.alterado" : "venda.criada",
            entityType: "venda",
            entityId: salvo.id,
            metadata: { titulo: dados.titulo, chave: maskPixKey(dados.pixChave), titular: dados.pixTitular },
          })
          .catch((err) => log.error("[vendas] falha ao registrar auditoria", err));
        confirmacaoEnviada = await pedirConfirmacao(actor, church.name, { id: salvo.id, ...dados });
      }
      return { ...salvo, confirmacaoEnviada };
    },

    async reenviarConfirmacao(actor: VendasActor, id: string): Promise<void> {
      const { church, venda } = await vendaDaIgreja(actor, id);
      if (venda.pixConfirmadoEm !== null) {
        throw new AppError("validation_error", "A chave desta venda já foi confirmada.");
      }
      if (!(await pedirConfirmacao(actor, church.name, venda))) {
        throw new AppError("internal_error", "Não conseguimos enviar o e-mail agora. Tente de novo em instantes.");
      }
    },

    async definirStatus(actor: VendasActor, id: string, status: unknown): Promise<void> {
      const { venda } = await vendaDaIgreja(actor, id);
      if (status !== "ativa" && status !== "encerrada") throw new AppError("validation_error", "Situação inválida.");
      await repo.definirStatus(venda.id, status);
    },

    async excluir(actor: VendasActor, id: string): Promise<void> {
      const { venda } = await vendaDaIgreja(actor, id);
      await repo.excluir(venda.id);
    },

    async marcarPedido(actor: VendasActor, pedidoId: string, status: unknown): Promise<void> {
      exige(actor);
      if (!z.uuid().safeParse(pedidoId).success) throw new AppError("not_found", "Pedido não encontrado.");
      if (status !== "pendente" && status !== "pago" && status !== "cancelado") {
        throw new AppError("validation_error", "Situação inválida.");
      }
      await repo.marcarPedido(pedidoId, status);
    },

    /**
     * Retirada. Pedido ainda não pago pode ser entregue (quem entrega conferiu
     * o comprovante na hora): com `tambemPago`, marca pago e entregue juntos.
     */
    async marcarEntrega(
      actor: VendasActor,
      pedidoId: string,
      input: { entregue: boolean; obs?: string | null; tambemPago?: boolean },
    ): Promise<void> {
      exige(actor);
      if (!z.uuid().safeParse(pedidoId).success) throw new AppError("not_found", "Pedido não encontrado.");
      const obs = (input.obs ?? "").trim();
      if (obs.length > 300) throw new AppError("validation_error", "Observação da entrega longa demais.");
      if (input.entregue && input.tambemPago) await repo.marcarPedido(pedidoId, "pago");
      await repo.marcarEntrega(pedidoId, input.entregue, obs || null);
    },

    /** Busca pelo código curto do voucher ("K7P-4QX"), dentro da igreja de quem cuida. */
    async buscarVoucher(actor: VendasActor, codigo: string) {
      const church = await igreja(actor);
      const normalizado = normalizarCodigoVoucher(codigo);
      if (!normalizado) return [];
      return repo.pedidosPorCodigo(church.id, normalizado);
    },

    /** O pedido do link do voucher. Null quando não é desta igreja ou o link não existe. */
    async pedidoDoVoucher(actor: VendasActor, token: unknown) {
      exige(actor);
      if (!deps.tokens || !tokenSchema.safeParse(token).success) return null;
      const achado = await repo.pedidoPorVoucherHash(deps.tokens.hash(token as string));
      if (!achado) return null;
      return {
        ...achado,
        entreguePor: achado.pedido.entregueEm ? await repo.quemEntregou(achado.pedido.id) : null,
      };
    },
  };
}

export type VendasService = ReturnType<typeof createVendasService>;

// ---------------------------------------------------------------------------
// Página pública
// ---------------------------------------------------------------------------

export interface VendasPublicasRepository {
  listar(churchId: string): Promise<VendaPublica[]>;
  /** Grava o pedido conferindo tudo de novo no banco. Erros de regra vêm com a mensagem para a pessoa. */
  criarPedido(input: {
    vendaId: string;
    nome: string;
    telefone: string;
    quantidade: number;
    observacao: string | null;
    itens: Array<{ opcaoId: string; quantidade: number }>;
    voucherHash: string | null;
  }): Promise<{
    pedidoId: string;
    totalCents: number;
    pixChave: string;
    pixTitular: string;
    churchName: string;
    churchAddress: string | null;
    whatsappComprovante: string | null;
    /** Só quando a venda gera voucher. */
    voucherCodigo: string | null;
  }>;
  /** O voucher do link; null se o link não existe. */
  voucher(token: string): Promise<VoucherPublico | null>;
}

export function createVendasPublicasService(deps: {
  repo: VendasPublicasRepository;
  qr: (texto: string) => Promise<string>;
  /** Para o link do voucher: o servidor gera o token e o banco guarda só o hash. */
  tokens?: { make(): string; hash(token: string): string };
  /** Endereço do site, para o link do voucher que vai no QR Code. */
  appUrl?: string;
}) {
  return {
    listar(churchId: string): Promise<VendaPublica[]> {
      return deps.repo.listar(churchId);
    },

    /** Grava o pedido e devolve o Pix com o total já embutido. */
    async pedir(input: unknown): Promise<{
      pedidoId: string;
      totalCents: number;
      pixChave: string;
      pixTitular: string;
      pixCopiaECola: string;
      pixQrDataUrl: string;
      whatsappComprovante: string | null;
      voucher: { url: string; codigo: string } | null;
    }> {
      const parsed = pedidoPublicoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      // O token vai sempre; o banco só usa se a venda gera voucher.
      const token = deps.tokens?.make() ?? null;
      const pedido = await deps.repo.criarPedido({
        ...parsed.data,
        voucherHash: token && deps.tokens ? deps.tokens.hash(token) : null,
      });
      let voucher: { url: string; codigo: string } | null = null;
      if (token && pedido.voucherCodigo && deps.appUrl) {
        const url = `${deps.appUrl.replace(/\/+$/, "")}/voucher/${token}`;
        // O QR Code do voucher fica na página dele (/voucher/...), não na tela do Pix.
        voucher = { url, codigo: pedido.voucherCodigo };
      }
      const pixCopiaECola = buildPixPayload({
        chave: pedido.pixChave,
        titular: pedido.pixTitular,
        cidade: pedido.churchAddress?.split(/[-,]/).at(-1)?.trim(),
        valorCents: pedido.totalCents,
        txid: pedido.pedidoId,
      });
      return {
        pedidoId: pedido.pedidoId,
        totalCents: pedido.totalCents,
        pixChave: pedido.pixChave,
        pixTitular: pedido.pixTitular,
        pixCopiaECola,
        pixQrDataUrl: await deps.qr(pixCopiaECola),
        whatsappComprovante: pedido.whatsappComprovante,
        voucher,
      };
    },

    /** Voucher pelo link (sem login). Token malformado é tratado como inexistente. */
    async voucher(token: unknown): Promise<VoucherPublico | null> {
      if (!tokenSchema.safeParse(token).success) return null;
      return deps.repo.voucher(token as string);
    },
  };
}

export type VendasPublicasService = ReturnType<typeof createVendasPublicasService>;

// ---------------------------------------------------------------------------
// Link de confirmação da chave (sem login: o token é a credencial)
// ---------------------------------------------------------------------------

/** Token de URL como o `makeUrlToken` gera (32 bytes em base64url). */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type ConfirmacaoVendaEstado = "valido" | "usado" | "substituido" | "expirado";

export interface ConfirmacaoVenda {
  estado: ConfirmacaoVendaEstado;
  churchName: string;
  titulo: string;
  precoCents: number;
  /** Só vêm enquanto o link vale. */
  chave: string | null;
  titular: string | null;
  whatsapp: string | null;
}

export interface ConfirmacaoVendaRepository {
  consultar(token: string): Promise<ConfirmacaoVenda | null>;
  /** Lança `not_found` se o link não vale mais. */
  confirmar(token: string): Promise<{ churchName: string; titulo: string }>;
}

export function createConfirmacaoVendaService(repo: ConfirmacaoVendaRepository) {
  return {
    async consultar(token: unknown): Promise<ConfirmacaoVenda | null> {
      const parsed = tokenSchema.safeParse(token);
      return parsed.success ? repo.consultar(parsed.data) : null;
    },
    async confirmar(token: unknown): Promise<{ churchName: string; titulo: string }> {
      const parsed = tokenSchema.safeParse(token);
      if (!parsed.success) throw new AppError("not_found", "Este link de confirmação não vale mais.");
      return repo.confirmar(parsed.data);
    },
  };
}
