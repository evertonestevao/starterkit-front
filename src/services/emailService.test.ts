import { describe, expect, it } from "vitest";
import type { EmailMessage, EmailProvider } from "@/adapters/email/EmailProvider";
import { AppError } from "@/lib/errors";
import type { CompanyInvite } from "@/types/database";
import { createEmailService } from "./emailService";

const TOKEN = "33333333-3333-4333-8333-333333333333";

const invite: CompanyInvite = {
  id: "44444444-4444-4444-8444-444444444444",
  company_id: "11111111-1111-4111-8111-111111111111",
  email: "novo@test.com",
  role: "admin",
  invited_by: "22222222-2222-4222-8222-222222222222",
  token: TOKEN,
  status: "pending",
  expires_at: "",
  deleted_at: null,
  created_at: "",
  updated_at: "",
};

function makeProvider(sent: EmailMessage[]): EmailProvider {
  return {
    name: "test",
    async send(message) {
      sent.push(message);
    },
  };
}

describe("emailService.sendInviteEmail", () => {
  it("monta o email com link de aceite contendo o token", async () => {
    const sent: EmailMessage[] = [];
    const service = createEmailService({
      provider: makeProvider(sent),
      appUrl: "https://app.example.com/",
    });
    await service.sendInviteEmail(invite, { churchName: "Igreja Esperança" });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("novo@test.com");
    // barra final da appUrl não pode duplicar no link
    expect(sent[0].html).toContain(`https://app.example.com/invites/accept?token=${TOKEN}`);
    expect(sent[0].text).toContain(`token=${TOKEN}`);
    // Diz qual igreja convidou e o acesso em português, não o código do papel.
    expect(sent[0].subject).toBe("Convite para acessar o sistema da Igreja Esperança");
    expect(sent[0].html).toContain("Igreja Esperança");
    expect(sent[0].html).toContain("Administrador");
    expect(sent[0].html).not.toContain("admin<");
    expect(sent[0].text).toContain("novo@test.com");
  });

  it("sem o nome da igreja o e-mail ainda sai, e o nome vindo do usuário é escapado no HTML", async () => {
    const sent: EmailMessage[] = [];
    const service = createEmailService({ provider: makeProvider(sent), appUrl: "https://app.example.com" });
    await service.sendInviteEmail(invite);
    await service.sendInviteEmail(invite, { churchName: 'Igreja <script>alert("x")</script>' });
    expect(sent[0].subject).toBe("Convite para acessar o sistema da igreja");
    expect(sent[0].text).toContain("Uma igreja convidou você");
    expect(sent[1].html).not.toContain("<script>");
    expect(sent[1].html).toContain("&lt;script&gt;");
  });

  it("propaga falha do provider como AppError", async () => {
    const service = createEmailService({
      provider: {
        name: "broken",
        async send() {
          throw new AppError("email_error", "Falha ao enviar email");
        },
      },
      appUrl: "http://localhost:3000",
    });
    await expect(service.sendInviteEmail(invite)).rejects.toMatchObject({
      code: "email_error",
    });
  });
});
