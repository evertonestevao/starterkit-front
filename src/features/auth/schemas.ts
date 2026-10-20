import { z } from "zod";

/**
 * Schemas de auth compartilhados entre client (feedback imediato no form) e
 * server (fonte de verdade — toda server action valida de novo).
 */

export const emailSchema = z.email("Email inválido");

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa de pelo menos 8 caracteres")
  .max(72, "A senha pode ter no máximo 72 caracteres");

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
