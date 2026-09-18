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

    /**
     * Avisa o dono da conta de que pediram alteração no que aparece nas
     * páginas das igrejas. É a defesa real contra conta invadida: a fila da
     * moderação atrasa o estrago, este email é quem o desfaz.
     */
    async sendSponsorProfileChangeRequested(input: {
      to: string;
      displayNameBefore: string;
      displayNameAfter: string | null;
      logoChanged: boolean;
      undoUrl: string;
    }): Promise<void> {
      const mudancas: string[] = [];
      if (input.displayNameAfter) {
        mudancas.push(`Nome: "${input.displayNameBefore}" → "${input.displayNameAfter}"`);
      }
      if (input.logoChanged) mudancas.push("Logo: um novo arquivo foi enviado");

      await provider.send({
        to: input.to,
        subject: "Pedido de alteração no seu perfil de patrocinador",
        text: `Recebemos um pedido para alterar o que aparece nas páginas das igrejas que você apoia:

${mudancas.map((m) => `- ${m}`).join("\n")}

A alteração passa pela conferência da nossa equipe antes de entrar no ar, então nada mudou ainda.

Se não foi você, desfaça agora: ${input.undoUrl}

Isso cancela o pedido e bloqueia novas alterações na sua conta até falar com o suporte.`,
        html: [
          "<p>Recebemos um pedido para alterar o que aparece nas páginas das igrejas que você apoia:</p>",
          `<ul>${mudancas.map((m) => `<li>${m}</li>`).join("")}</ul>`,
          "<p>A alteração passa pela conferência da nossa equipe antes de entrar no ar, então nada mudou ainda.</p>",
          `<p><strong>Se não foi você:</strong> <a href="${input.undoUrl}">desfaça agora</a>.</p>`,
          "<p>Isso cancela o pedido e bloqueia novas alterações na sua conta até você falar com o suporte.</p>",
        ].join("\n"),
      });
    },

    /** Resultado da conferência, para quem pediu. */
    async sendSponsorProfileDecision(input: {
      to: string;
      approved: boolean;
      displayName: string;
      reason: string | null;
    }): Promise<void> {
      const subject = input.approved
        ? "Sua alteração já está no ar"
        : "Sua alteração não foi aprovada";
      const corpo = input.approved
        ? `A alteração do seu perfil (${input.displayName}) foi conferida e já aparece nas páginas das igrejas que você apoia.`
        : `A alteração do seu perfil não foi aprovada. Motivo: ${input.reason ?? "não informado"}. Seu perfil anterior continua no ar, e você pode enviar outra alteração pelo painel.`;

      await provider.send({
        to: input.to,
        subject,
        text: corpo,
        html: `<p>${corpo}</p>`,
      });
    },

    /**
     * Aviso para a moderação. Vai para todos os emails do staff — hoje é
     * email; o bot do Telegram entra como outro provider, sem mexer aqui.
     */
    async sendPlatformStaffAlert(input: {
      to: string[];
      subject: string;
      lines: string[];
    }): Promise<void> {
      if (input.to.length === 0) return;
      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: input.subject,
            text: input.lines.join("\n\n"),
            html: input.lines.map((line) => `<p>${line}</p>`).join("\n"),
          }),
        ),
      );
    },
  };

  // O objeto atende InviteNotifier (e ainda expõe o email do patrocinador).
  const notifier: InviteNotifier = service;
  void notifier;
  return service;
}

export type EmailService = ReturnType<typeof createEmailService>;
