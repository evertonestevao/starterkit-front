import { z } from "zod";
import type { PixStatus } from "@/lib/pixStatus";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";

/**
 * Chave PIX da igreja (dízimos e ofertas).
 *
 * Esta é a coluna mais valiosa da tabela para um golpista: quem trocar a
 * chave desvia as doações da igreja sem ninguém perceber, porque a página
 * continua igual. Daí o cuidado desproporcional ao tamanho do campo —
 * confirmação na tela, registro em `audit_logs` e email para TODOS os
 * administradores, inclusive para quem fez a troca. Se a conta de alguém for
 * invadida, os outros ficam sabendo pelo email.
 *
 * E a chave nova NÃO vai para a página sozinha: o Responsável (owner) recebe
 * um link no e-mail e é ele quem confirma. Uma sessão roubada, ou um
 * administrador agindo sozinho, não publica uma chave.
 */

/** Validade do link de confirmação, em horas. */
export const VALIDADE_CONFIRMACAO_HORAS = 48;

/** Token de URL como o `makeUrlToken` gera (32 bytes em base64url). */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type PixConfirmacaoEstado = "valido" | "usado" | "substituido" | "expirado";

export interface PixConfirmacao {
  estado: PixConfirmacaoEstado;
  churchName: string;
  /** Só vem enquanto o link vale. */
  chave: string | null;
  titular: string | null;
}

export type PixKeyKind = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

/** Descobre o tipo da chave, para validar o formato certo. */
export function detectPixKeyKind(chave: string): PixKeyKind | null {
  const valor = chave.trim();
  const digitos = valor.replace(/\D/g, "");

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) return "aleatoria";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return "email";
  if (valor.startsWith("+") && digitos.length >= 12 && digitos.length <= 13) return "telefone";
  if (/^\d{10,11}$/.test(digitos) && /^[\d\s()\-+]+$/.test(valor) && digitos.length === 11 && !valor.includes("+")) {
    // 11 dígitos é ambíguo: CPF e celular com DDD têm o mesmo tamanho. O PIX
    // trata CPF como número puro e celular com +55, então aqui é CPF.
    return "cpf";
  }
  if (digitos.length === 11 && /^[\d.\-]+$/.test(valor)) return "cpf";
  if (digitos.length === 14 && /^[\d./\-]+$/.test(valor)) return "cnpj";
  return null;
}

const pixSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  chave: z.string().trim().min(5, "Informe a chave PIX").max(140, "Chave PIX longa demais"),
  titular: z.string().trim().min(3, "Informe o nome do titular da chave").max(140, "Nome do titular longo demais"),
  /** A tela mostra o que vai ser gravado e pede confirmação antes de salvar. */
  confirmado: z.literal(true, "Confirme os dados da chave antes de salvar"),
});

export interface ChurchPixRepository {
  /** Igrejas da empresa ativa, para escolher qual recebe a chave. */
  listCompanyChurches(companyId: string): Promise<
    Array<{
      id: string;
      name: string;
      pixChave: string | null;
      pixTitular: string | null;
      /** A chave só vai para a página depois de confirmada pelo Responsável. */
      pixStatus: PixStatus;
      pixMotivoRecusa: string | null;
    }>
  >;
  updatePix(input: { churchId: string; companyId: string; chave: string; titular: string }): Promise<void>;
  /** Emails de quem administra a empresa — todos são avisados da troca. */
  listCompanyAdminEmails(companyId: string): Promise<string[]>;
  /**
   * Grava o pedido de confirmação (só o hash do token) e devolve o e-mail do
   * Responsável. Roda com `service_role`: se o próprio usuário pudesse criar o
   * pedido, escolheria o token e confirmaria sozinho.
   */
  criarConfirmacao(input: {
    churchId: string;
    tokenHash: string;
    solicitadoPor: string;
    validadeHoras: number;
  }): Promise<string[]>;
  /** O que o link confirma; `null` quando o token não existe. */
  confirmacaoPorToken(token: string): Promise<PixConfirmacao | null>;
  /** Confirma a chave. Lança `not_found` se o link não vale mais. */
  confirmarPorToken(token: string): Promise<{ churchName: string; publicCode: string }>;
}

export interface PixTokens {
  make(): string;
  hash(token: string): string;
}

export interface PixNotifier {
  sendPixChanged(input: {
    to: string[];
    churchName: string;
    chaveMascarada: string;
    titular: string;
    alteradoPor: string;
  }): Promise<void>;
  sendPixConfirmation(input: {
    to: string[];
    churchName: string;
    chaveMascarada: string;
    titular: string;
    alteradoPor: string;
    token: string;
    validadeHoras: number;
  }): Promise<void>;
}

export interface PixAuditRecorder {
  record(input: {
    companyId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface PixActor {
  companyId: string;
  role: RoleCode;
  userId: string;
  email: string;
}

const QUEM_EDITA: RoleCode[] = ["owner", "admin"];

export function canEditPix(role: RoleCode): boolean {
  return QUEM_EDITA.includes(role);
}

/**
 * Nunca logamos nem enviamos a chave inteira por email: o email é justamente
 * o canal que um invasor pode estar lendo. O dono reconhece a própria chave
 * pelo começo e pelo fim.
 */
export function maskPixKey(chave: string): string {
  const valor = chave.trim();
  if (valor.length <= 6) return `${valor.slice(0, 1)}***`;
  return `${valor.slice(0, 3)}***${valor.slice(-3)}`;
}

export function createChurchPixService(deps: {
  repo: ChurchPixRepository;
  notifier?: PixNotifier;
  audit?: PixAuditRecorder;
  /** Sem isto (testes antigos, ambiente sem e-mail) o link não é gerado. */
  tokens?: PixTokens;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;

  /**
   * Gera o link e manda para o Responsável. Devolve se o e-mail saiu: a chave
   * já está salva de qualquer jeito, e a tela oferece "Reenviar".
   */
  async function pedirConfirmacao(
    actor: PixActor,
    igreja: { id: string; name: string },
    chave: string,
    titular: string,
  ): Promise<boolean> {
    if (!deps.tokens || !deps.notifier) return false;
    try {
      const token = deps.tokens.make();
      const responsaveis = await deps.repo.criarConfirmacao({
        churchId: igreja.id,
        tokenHash: deps.tokens.hash(token),
        solicitadoPor: actor.userId,
        validadeHoras: VALIDADE_CONFIRMACAO_HORAS,
      });
      if (responsaveis.length === 0) return false;
      await deps.notifier.sendPixConfirmation({
        to: responsaveis,
        churchName: igreja.name,
        chaveMascarada: maskPixKey(chave),
        titular,
        alteradoPor: actor.email,
        token,
        validadeHoras: VALIDADE_CONFIRMACAO_HORAS,
      });
      return true;
    } catch (err) {
      log.error("[pix] falha ao enviar o link de confirmação", err);
      return false;
    }
  }

  return {
    listChurches(companyId: string) {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return deps.repo.listCompanyChurches(companyId);
    },

    /** Devolve se o link de confirmação foi enviado ao Responsável. */
    async savePix(actor: PixActor, input: unknown): Promise<{ confirmacaoEnviada: boolean }> {
      if (!canEditPix(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja pode alterar a chave PIX.");
      }

      const parsed = pixSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, chave, titular } = parsed.data;

      if (!detectPixKeyKind(chave)) {
        throw new AppError(
          "validation_error",
          "Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone com +55 ou chave aleatória.",
        );
      }

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      const igreja = igrejas.find((c) => c.id === churchId);
      if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");

      await deps.repo.updatePix({ churchId, companyId: actor.companyId, chave, titular });

      // A trilha guarda só a chave mascarada: `audit_logs` é lido por toda a
      // equipe, e a chave inteira não precisa estar lá.
      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: "church.pix.updated",
          entityType: "church",
          entityId: churchId,
          metadata: {
            chave_anterior: igreja.pixChave ? maskPixKey(igreja.pixChave) : null,
            chave_nova: maskPixKey(chave),
            titular,
          },
        })
        .catch((err) => log.error("[pix] falha ao registrar auditoria", err));

      // O aviso é o que transforma uma troca silenciosa em algo que a igreja
      // percebe no mesmo dia. Falhar aqui não desfaz a alteração.
      const admins = await deps.repo.listCompanyAdminEmails(actor.companyId).catch(() => []);
      if (admins.length > 0) {
        await deps.notifier
          ?.sendPixChanged({
            to: admins,
            churchName: igreja.name,
            chaveMascarada: maskPixKey(chave),
            titular,
            alteradoPor: actor.email,
          })
          .catch((err) => log.error("[pix] falha ao avisar os administradores", err));
      }

      return { confirmacaoEnviada: await pedirConfirmacao(actor, igreja, chave, titular) };
    },

    /** Manda um link novo (o anterior deixa de valer). Só enquanto a chave aguarda confirmação. */
    async reenviarConfirmacao(actor: PixActor, churchId: string): Promise<void> {
      if (!canEditPix(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja pode pedir a confirmação da chave PIX.");
      }
      const igreja = (await deps.repo.listCompanyChurches(actor.companyId)).find((c) => c.id === churchId);
      if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");
      if (igreja.pixStatus !== "aguardando" || !igreja.pixChave) {
        throw new AppError("validation_error", "Esta chave não está aguardando confirmação.");
      }
      const enviado = await pedirConfirmacao(actor, igreja, igreja.pixChave, igreja.pixTitular ?? "");
      if (!enviado) {
        throw new AppError("internal_error", "Não conseguimos enviar o e-mail agora. Tente de novo em instantes.");
      }
    },

    /** O que o link do e-mail confirma. Token malformado é tratado como inexistente. */
    async consultarConfirmacao(token: unknown): Promise<PixConfirmacao | null> {
      const parsed = tokenSchema.safeParse(token);
      if (!parsed.success) return null;
      return deps.repo.confirmacaoPorToken(parsed.data);
    },

    /** Confirma a chave pelo link do e-mail. Sem login: quem tem o link é quem recebeu o e-mail. */
    async confirmarPorToken(token: unknown): Promise<{ churchName: string; publicCode: string }> {
      const parsed = tokenSchema.safeParse(token);
      if (!parsed.success) throw new AppError("not_found", "Este link de confirmação não vale mais.");
      return deps.repo.confirmarPorToken(parsed.data);
    },
  };
}

export type ChurchPixService = ReturnType<typeof createChurchPixService>;
