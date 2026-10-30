import { z } from "zod";
import { normalizeReferralCode } from "./referralCookie";

/** Validação das entradas do painel, usada no servidor antes de qualquer escrita. */

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable());

const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int("Use um número inteiro").positive("Use um número maior que zero").nullable(),
);

/** "1.234,56" ou "1234.56" -> número. NaN se não for número. */
export function parseDecimal(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function parseCents(value: unknown): number {
  return Math.round(parseDecimal(value) * 100);
}

const commissionValueFields = {
  commissionType: z.enum(["percent", "fixed"], { error: "Escolha o tipo" }),
  value: z.unknown(),
  durationMonths: optionalPositiveInt,
};

/** Valor conforme o tipo, nas colunas do banco: percentual ou centavos. */
export function toCommissionColumns(type: "percent" | "fixed", value: unknown) {
  if (type === "percent") {
    const percent = parseDecimal(value);
    if (!(percent >= 0 && percent <= 100)) {
      throw new z.ZodError([
        { code: "custom", path: ["value"], message: "O percentual precisa estar entre 0 e 100", input: value },
      ]);
    }
    return { commission_percent: percent, commission_fixed_cents: null };
  }
  const cents = parseCents(value);
  if (!(cents >= 0)) {
    throw new z.ZodError([
      { code: "custom", path: ["value"], message: "Informe um valor em reais", input: value },
    ]);
  }
  return { commission_percent: null, commission_fixed_cents: cents };
}

const referralCode = z.string().transform((value, ctx) => {
  const code = normalizeReferralCode(value);
  if (!code) {
    ctx.addIssue({ code: "custom", message: "Código: use letras, números e hífen" });
    return z.NEVER;
  }
  return code;
});

export const createResellerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  referralCode: z.preprocess((v) => (v === "" || v == null ? undefined : v), referralCode.optional()),
});

export const updateResellerSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Informe o nome"),
  referralCode,
});

export const resellerStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["active", "suspended"]),
});

export const commissionRuleSchema = z.object({
  resellerId: optionalUuid,
  planId: optionalUuid,
  // Vazio = vale desde a primeira venda.
  fromSaleNumber: z.preprocess(
    (v) => (v === "" || v == null ? 1 : v),
    z.coerce.number().int().min(1, "A venda precisa ser 1 ou maior"),
  ),
  ...commissionValueFields,
});

export const clientCommissionSchema = z.object({
  id: z.uuid(),
  ...commissionValueFields,
});

export const commissionAmountSchema = z.object({
  id: z.uuid(),
  amount: z.unknown(),
});

export const markPaidSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um lançamento"),
  paidAt: z.iso.date("Informe a data do pagamento"),
});

/** Filtros da lista de lançamentos. Valor inválido na URL é ignorado, não dá erro. */
export const commissionFiltersSchema = z.object({
  reseller: z.uuid().optional().catch(undefined),
  plan: z.uuid().optional().catch(undefined),
  status: z.enum(["pending", "paid", "reversed"]).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});

export type CommissionFilters = z.infer<typeof commissionFiltersSchema>;
