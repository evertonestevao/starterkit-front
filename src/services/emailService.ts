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

  const service = {
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

    /**
     * Link de acesso do patrocinador (conta sem senha). Dois textos: quem
     * acabou de assinar e quem já tinha conta — este último NÃO confirma que
     * a conta existe para quem não é o dono do email; quem recebe já sabe.
     */
    async sendSponsorAccessLink(input: {
      to: string;
      url: string;
      churchName: string;
      isNewSponsor: boolean;
    }): Promise<void> {
      const subject = input.isNewSponsor
        ? `Seu patrocínio a ${input.churchName}`
        : `Confirme seu patrocínio a ${input.churchName}`;
      const intro = input.isNewSponsor
        ? `Obrigado por apoiar a ${input.churchName}! Use o link abaixo para entrar no seu painel e acompanhar o patrocínio.`
        : `Para adicionar a ${input.churchName} ao seu patrocínio, entre pelo link abaixo — lá você confirma e vê o valor já com desconto.`;

      await provider.send({
        to: input.to,
        subject,
        text: `${intro}

${input.url}

O link vale por uma única entrada. Se não foi você, ignore este email.`,
        html: [
          `<p>${intro}</p>`,
          `<p><a href="${input.url}">Entrar no painel do patrocinador</a></p>`,
          "<p>O link vale por uma única entrada. Se não foi você que pediu, ignore este email.</p>",
        ].join("\n"),
      });
    },
  };

  // O objeto atende InviteNotifier (e ainda expõe o email do patrocinador).
  const notifier: InviteNotifier = service;
  void notifier;
  return service;
}

export type EmailService = ReturnType<typeof createEmailService>;
