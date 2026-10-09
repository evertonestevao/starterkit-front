import { AppError, toValidationError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import {
  alterarSenhaSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";

/**
 * Regras de autenticação. O repositório abstrai o provedor (Supabase Auth);
 * o rate limiter é obrigatório em login e recuperação de senha (CLAUDE.md).
 */

export interface AuthRepository {
  /** `redirectTo`: para onde o link do e-mail de confirmação leva. */
  signUp(data: { email: string; password: string; fullName: string; redirectTo: string }): Promise<void>;
  signInWithPassword(data: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  /** Dispara o email de recuperação com link para redirectTo. */
  resetPasswordForEmail(email: string, redirectTo: string): Promise<void>;
  /** Troca a senha do usuário logado (sessão de recovery conta como logado). */
  updatePassword(newPassword: string): Promise<void>;
  /** E-mail de quem está logado; null sem sessão. */
  emailDoUsuarioAtual(): Promise<string | null>;
  /** A senha confere com a conta? Não mexe na sessão atual. */
  senhaConfere(email: string, senha: string): Promise<boolean>;
}

interface AuthServiceDeps {
  repo: AuthRepository;
  rateLimiter: RateLimiter;
  /** URL pública da app para montar o link de recuperação. */
  appUrl: string;
}

export function createAuthService({ repo, rateLimiter, appUrl }: AuthServiceDeps) {
  const base = appUrl.replace(/\/+$/, "");

  /**
   * `voltarPara`: caminho do site para onde a pessoa vai depois de confirmar o
   * e-mail (ex.: o link de vínculo que ela abriu). Sem isso, a confirmação leva
   * ao cadastro da igreja. Só caminho relativo (nada de redirecionar para fora).
   */
  async function signUp(input: unknown, voltarPara?: string): Promise<void> {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) throw toValidationError(parsed.error.issues);
    await rateLimiter.consume(`signup:${parsed.data.email.toLowerCase()}`);
    const destino = voltarPara && voltarPara.startsWith("/") && !voltarPara.startsWith("//") ? voltarPara : "/onboarding";
    await repo.signUp({ ...parsed.data, redirectTo: `${base}/auth/confirm?next=${encodeURIComponent(destino)}` });
  }

  async function signIn(input: unknown): Promise<void> {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Dados inválidos");
    }
    // Limite por email: bloqueia força bruta na conta mesmo com IPs variados.
    await rateLimiter.consume(`login:${parsed.data.email.toLowerCase()}`);
    await repo.signInWithPassword(parsed.data);
  }

  async function signOut(): Promise<void> {
    await repo.signOut();
  }

  async function requestPasswordReset(input: unknown): Promise<void> {
    const parsed = forgotPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Email inválido");
    }
    await rateLimiter.consume(`password-reset:${parsed.data.email.toLowerCase()}`);
    // next= diz ao /auth/confirm para onde ir após criar a sessão de recovery.
    await repo.resetPasswordForEmail(parsed.data.email, `${base}/auth/confirm?next=/reset-password`);
  }

  async function resetPassword(input: unknown): Promise<void> {
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Senha inválida");
    }
    await repo.updatePassword(parsed.data.password);
  }

  /**
   * Trocar a senha dentro do painel: só com a senha ATUAL. Tem limite de
   * tentativas, senão a tela viraria um jeito de adivinhar a senha de quem
   * deixou a conta aberta.
   */
  async function alterarSenha(input: unknown): Promise<void> {
    const parsed = alterarSenhaSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Senha inválida");
    }
    const email = await repo.emailDoUsuarioAtual();
    if (!email) throw new AppError("unauthorized", "Sessão expirada. Entre de novo.");
    await rateLimiter.consume(`troca-senha:${email.toLowerCase()}`);
    if (!(await repo.senhaConfere(email, parsed.data.senhaAtual))) {
      throw new AppError("validation_error", "A senha atual não confere.");
    }
    await repo.updatePassword(parsed.data.novaSenha);
  }

  return { signUp, signIn, signOut, requestPasswordReset, resetPassword, alterarSenha };
}

export type AuthService = ReturnType<typeof createAuthService>;
