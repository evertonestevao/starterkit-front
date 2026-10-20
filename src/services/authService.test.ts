import { describe, expect, it, vi } from "vitest";
import { createAuthService, type AuthRepository } from "./authService";

function criar(over: Partial<AuthRepository> = {}) {
  const repo: AuthRepository = {
    signUp: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    resetPasswordForEmail: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    emailDoUsuarioAtual: vi.fn(async () => "pastor@igreja.com"),
    senhaConfere: vi.fn(async () => true),
    ...over,
  };
  const rateLimiter = { consume: vi.fn(async () => {}) };
  const service = createAuthService({ repo, rateLimiter, appUrl: "https://www.assembleiaapp.com.br/" });
  return { repo, rateLimiter, service };
}

const valida = { senhaAtual: "Antiga#2025", novaSenha: "Igreja#2026", confirmacao: "Igreja#2026" };

describe("authService.alterarSenha", () => {
  it("com a senha atual certa e uma nova forte, troca", async () => {
    const { service, repo, rateLimiter } = criar();
    await service.alterarSenha(valida);
    expect(repo.senhaConfere).toHaveBeenCalledWith("pastor@igreja.com", "Antiga#2025");
    expect(repo.updatePassword).toHaveBeenCalledWith("Igreja#2026");
    expect(rateLimiter.consume).toHaveBeenCalledWith("troca-senha:pastor@igreja.com");
  });

  it("senha atual errada não troca", async () => {
    const { service, repo } = criar({ senhaConfere: vi.fn(async () => false) });
    await expect(service.alterarSenha(valida)).rejects.toMatchObject({ message: "A senha atual não confere." });
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  it("nova senha fraca, confirmação diferente ou igual à atual são recusadas antes de tudo", async () => {
    const { service, repo } = criar();
    for (const ruim of [
      { ...valida, novaSenha: "igreja2026", confirmacao: "igreja2026" },
      { ...valida, confirmacao: "Outra#2026" },
      { senhaAtual: "Igreja#2026", novaSenha: "Igreja#2026", confirmacao: "Igreja#2026" },
    ]) {
      await expect(service.alterarSenha(ruim)).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(repo.senhaConfere).not.toHaveBeenCalled();
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  it("sem sessão, pede para entrar de novo", async () => {
    const { service } = criar({ emailDoUsuarioAtual: vi.fn(async () => null) });
    await expect(service.alterarSenha(valida)).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("authService: senha forte no cadastro e na nova senha", () => {
  it("cadastro e redefinição recusam senha sem maiúscula, número ou símbolo, em português", async () => {
    const { service, repo } = criar();
    await expect(
      service.signUp({ fullName: "Ana", email: "ana@igreja.com", password: "igrejaigreja" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("A senha precisa ter") });
    await expect(service.resetPassword({ password: "Igreja2026" })).rejects.toMatchObject({
      message: "A senha precisa ter um símbolo (como ! @ # $ % *).",
    });
    expect(repo.signUp).not.toHaveBeenCalled();
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  it("o link de recuperação volta para a tela de nova senha no endereço do site", async () => {
    const { service, repo } = criar();
    await service.requestPasswordReset({ email: "ana@igreja.com" });
    expect(repo.resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@igreja.com",
      "https://www.assembleiaapp.com.br/auth/confirm?next=/reset-password",
    );
  });
});

describe("signUp: volta depois de confirmar o e-mail", () => {
  it("o link do e-mail leva de volta ao convite; sem destino, ao cadastro da igreja; nunca para fora", async () => {
    const repo = {
      signUp: vi.fn(async () => {}),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updatePassword: vi.fn(),
      emailDoUsuarioAtual: vi.fn(),
      senhaConfere: vi.fn(),
    };
    const service = createAuthService({
      repo,
      rateLimiter: { consume: vi.fn(async () => {}) } as never,
      appUrl: "https://www.assembleiaapp.com.br/",
    });
    const dados = { fullName: "Ana", email: "ana@igreja.com", password: "Senha-forte-1" };

    await service.signUp(dados, "/vinculo/abc123");
    expect(repo.signUp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        redirectTo: "https://www.assembleiaapp.com.br/auth/confirm?next=%2Fvinculo%2Fabc123",
      }),
    );
    await service.signUp(dados);
    expect(repo.signUp).toHaveBeenLastCalledWith(expect.objectContaining({ redirectTo: expect.stringContaining("next=%2Fonboarding") }));
    await service.signUp(dados, "//golpe.com");
    expect(repo.signUp).toHaveBeenLastCalledWith(expect.objectContaining({ redirectTo: expect.stringContaining("next=%2Fonboarding") }));
  });
});
