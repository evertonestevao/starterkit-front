import { z } from "zod";
import { SENHA_MAX, mensagemDoQueFalta } from "@/lib/senha";

/**
 * Schemas de auth compartilhados entre client (feedback imediato no form) e
 * server (fonte de verdade — toda server action valida de novo).
 */

export const emailSchema = z.email("Email inválido");

/** Senha nova: a mesma regra que o Supabase aplica (src/lib/senha.ts), explicada em português. */
export const passwordSchema = z
  .string()
  .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres`)
  .superRefine((senha, ctx) => {
    const falta = mensagemDoQueFalta(senha);
    if (falta) ctx.addIssue({ code: "custom", message: falta });
  });

/** Trocar a senha logado: confirma a atual e repete a nova. */
export const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: passwordSchema,
    confirmacao: z.string(),
  })
  .refine((v) => v.novaSenha === v.confirmacao, {
    message: "A confirmação não é igual à nova senha",
    path: ["confirmacao"],
  })
  .refine((v) => v.novaSenha !== v.senhaAtual, {
    message: "A nova senha precisa ser diferente da atual",
    path: ["novaSenha"],
  });

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome").max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
