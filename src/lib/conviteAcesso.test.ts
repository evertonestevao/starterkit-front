import { describe, expect, it } from "vitest";
import { mensagemDoConviteDeAcesso } from "./conviteAcesso";

describe("mensagem do convite de acesso", () => {
  it("e-mail e link em linhas próprias, com o nome completo da igreja", () => {
    const m = mensagemDoConviteDeAcesso({
      saudacao: "A paz do Senhor!",
      igreja: "Assembleia de Deus no Ipiranga · Lins",
      email: "joao@igreja.org",
      url: "https://app.test/invites/accept?token=x",
      expiraEm: "2026-10-16T15:00:00Z",
    });
    const linhas = m.split("\n");
    expect(linhas[0]).toBe(
      "A paz do Senhor! A Assembleia de Deus no Ipiranga · Lins convidou você para acessar o sistema da igreja.",
    );
    expect(linhas).toContain("joao@igreja.org");
    expect(linhas).toContain("Link do convite (vale até 16/10/2026):");
    expect(linhas.at(-1)).toBe("https://app.test/invites/accept?token=x");
  });
});
