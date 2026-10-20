import type { EmailProvider } from "@/adapters/email/EmailProvider";
import type { CompanyInvite } from "@/types/database";
import type { InviteNotifier } from "./inviteService";

/**
 * Emails transacionais da aplicação. Monta o conteúdo aqui (regra de
 * negócio) e delega o envio ao EmailProvider ativo (adapter).
 * Implementa a porta InviteNotifier consumida pelo inviteService.
 */

interface EmailServiceDeps {
  provider: EmailProvider;
  /** URL pública da aplicação, usada nos links dos emails. */
  appUrl: string;
}

export function createEmailService({ provider, appUrl }: EmailServiceDeps) {
  const base = appUrl.replace(/\/+$/, "");

  const notifier: InviteNotifier = {
    async sendInviteEmail(invite: CompanyInvite): Promise<void> {
      const acceptUrl = `${base}/invites/accept?token=${invite.token}`;
      await provider.send({
        to: invite.email,
        subject: "Você foi convidado para uma empresa",
        text: `Você recebeu um convite (papel: ${invite.role}). Aceite em: ${acceptUrl}`,
        html: [
          "<p>Você recebeu um convite para entrar em uma empresa.</p>",
          `<p>Papel: <strong>${invite.role}</strong></p>`,
          `<p><a href="${acceptUrl}">Aceitar convite</a></p>`,
          "<p>O convite expira em 7 dias. Se você não esperava este email, ignore-o.</p>",
        ].join("\n"),
      });
    },
  };

  return notifier;
}

export type EmailService = ReturnType<typeof createEmailService>;
