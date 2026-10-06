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
 */

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
  chave: z
    .string()
    .trim()
    .min(5, "Informe a chave PIX")
    .max(140, "Chave PIX longa demais"),
  titular: z
    .string()
    .trim()
    .min(3, "Informe o nome do titular da chave")
    .max(140, "Nome do titular longo demais"),
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
      /** A chave só vai para a página depois de aprovada pela moderação. */
      pixStatus: PixStatus;
      pixMotivoRecusa: string | null;
    }>
  >;
  updatePix(input: { churchId: string; companyId: string; chave: string; titular: string }): Promise<void>;
  /** Emails de quem administra a empresa — todos são avisados da troca. */
  listCompanyAdminEmails(companyId: string): Promise<string[]>;
}

export interface PixNotifier {
  sendPixChanged(input: {
    to: string[];
    churchName: string;
    chaveMascarada: string;
    titular: string;
    alteradoPor: string;
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
  log?: { error(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;

  return {
    listChurches(companyId: string) {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return deps.repo.listCompanyChurches(companyId);
    },

    async savePix(actor: PixActor, input: unknown): Promise<void> {
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
    },
  };
}

export type ChurchPixService = ReturnType<typeof createChurchPixService>;
