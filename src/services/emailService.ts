import type { EmailProvider } from "@/adapters/email/EmailProvider";
import { describeApproved, LINK_TIPO_LABEL } from "@/lib/churchLinks";
import { PAPEL_LABEL } from "@/lib/papeis";
import type { ChurchLinkTipo } from "@/types/churchLinks";
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

/** Texto vindo do usuário indo para dentro de HTML de email. */
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createEmailService({ provider, appUrl }: EmailServiceDeps) {
  const base = appUrl.replace(/\/+$/, "");

  const service = {
    /**
     * Convite para acessar o sistema. Quem recebe pode nunca ter ouvido falar
     * do produto: o e-mail diz QUAL igreja convidou e o que acontece ao aceitar.
     */
    async sendInviteEmail(invite: CompanyInvite, contexto?: { churchName?: string | null }): Promise<void> {
      const acceptUrl = `${base}/invites/accept?token=${invite.token}`;
      const nome = contexto?.churchName?.trim();
      // Sem o nome (falha ao buscar), o texto continua correto: "Uma igreja convidou...".
      const quem = nome ? `A ${nome}` : "Uma igreja";
      const papel = PAPEL_LABEL[invite.role] ?? "Membro";
      await provider.send({
        to: invite.email,
        subject: nome ? `Convite para acessar o sistema da ${nome}` : "Convite para acessar o sistema da igreja",
        text: `A paz do Senhor!

${quem} convidou você para acessar o sistema da igreja (acesso: ${papel}).

Para aceitar, abra este link e entre com este mesmo e-mail (${invite.email}):
${acceptUrl}

Se você ainda não tem conta, é só criar uma com este e-mail e voltar ao link.
O convite vale por 7 dias. Se você não esperava este e-mail, pode ignorá-lo.`,
        html: [
          "<p>A paz do Senhor!</p>",
          `<p><strong>${escapeHtml(quem)}</strong> convidou você para acessar o sistema da igreja (acesso: ${escapeHtml(papel)}).</p>`,
          `<p><a href="${acceptUrl}" style="display:inline-block;padding:10px 18px;background:#41694b;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Aceitar o convite</a></p>`,
          `<p>Entre com este mesmo e-mail (<strong>${escapeHtml(invite.email)}</strong>). Se você ainda não tem conta, é só criar uma com ele e voltar a este link.</p>`,
          `<p style="color:#666;font-size:13px">Se o botão não abrir, copie e cole no navegador:<br>${acceptUrl}</p>`,
          '<p style="color:#666;font-size:13px">O convite vale por 7 dias. Se você não esperava este e-mail, pode ignorá-lo.</p>',
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
      linkChange: { href: string | null } | null;
      undoUrl: string;
    }): Promise<void> {
      const mudancas: string[] = [];
      if (input.displayNameAfter) {
        mudancas.push(`Nome: "${input.displayNameBefore}" → "${input.displayNameAfter}"`);
      }
      if (input.logoChanged) mudancas.push("Logo: um novo arquivo foi enviado");
      // O destino aparece por extenso: é onde o dono da conta percebe um
      // link que não pôs.
      if (input.linkChange) {
        mudancas.push(
          input.linkChange.href
            ? `Link da logo: ${input.linkChange.href}`
            : "Link da logo: removido",
        );
      }

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
          `<ul>${mudancas.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`,
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

    /** Conta destravada: a pessoa precisa saber que pode tentar de novo. */
    async sendSponsorHoldReleased(input: { to: string; displayName: string }): Promise<void> {
      const corpo = `A conta de ${input.displayName} foi liberada e você já pode enviar alterações de perfil de novo. Toda alteração continua passando pela conferência da nossa equipe antes de aparecer nas páginas das igrejas.`;
      await provider.send({
        to: input.to,
        subject: "Sua conta foi liberada",
        text: corpo,
        html: `<p>${corpo}</p>`,
      });
    },

    /**
     * Aviso para a moderação. Vai para todos os emails do staff — hoje é
     * email; o bot do Telegram entra como outro provider, sem mexer aqui.
     */
    /**
     * Troca da chave PIX da igreja. Vai para TODOS os administradores,
     * inclusive quem fez a troca: se uma conta for invadida, é por este email
     * que os outros ficam sabendo. A chave vai mascarada — o email pode estar
     * sendo lido por quem invadiu.
     */
    async sendPixChanged(input: {
      to: string[];
      churchName: string;
      chaveMascarada: string;
      titular: string;
      alteradoPor: string;
    }): Promise<void> {
      const assunto = `A chave PIX de ${input.churchName} foi alterada`;
      const linhas = [
        `A chave PIX que aparece na página de ${input.churchName} foi alterada por ${input.alteradoPor}.`,
        `Nova chave: ${input.chaveMascarada} · Titular: ${input.titular}`,
        "Se não foi você nem alguém da equipe, troque a senha da conta e volte a chave agora: é por ela que as doações entram.",
      ];
      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: assunto,
            text: linhas.join("\n\n"),
            html: linhas.map((l) => `<p>${l}</p>`).join("\n"),
          }),
        ),
      );
    },

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

    /**
     * Pedido de vínculo, para a igreja SUPERIOR: alguém abriu o link dela e quer
     * entrar na árvore. Nada mudou ainda — ela decide no painel.
     */
    async sendChurchLinkRequested(input: {
      to: string[];
      parentName: string;
      childName: string;
      tipo: ChurchLinkTipo;
    }): Promise<void> {
      if (input.to.length === 0) return;
      const painel = `${base}/dashboard/settings/vinculos`;
      const posicao = LINK_TIPO_LABEL[input.tipo].toLowerCase();
      const resumo = `${input.childName} pediu para ser ${posicao} de ${input.parentName}.`;
      const explicacao = "Nada mudou ainda: a igreja só entra na sua rede se você aprovar, e você pode ajustar a função ou recusar.";

      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: "Pedido de vínculo para a sua igreja",
            text: `${resumo}\n\n${explicacao}\n\nVeja o pedido e responda no painel: ${painel}`,
            html: [
              `<p>${escapeHtml(resumo)}</p>`,
              `<p>${escapeHtml(explicacao)}</p>`,
              `<p><a href="${painel}">Ver o pedido no painel</a></p>`,
            ].join("\n"),
          }),
        ),
      );
    },

    /** Decisão da superior sobre o pedido, para a igreja que pediu. */
    async sendChurchLinkDecided(input: {
      to: string[];
      approved: boolean;
      parentName: string;
      childName: string;
      tipo: ChurchLinkTipo;
      motivo: string | null;
    }): Promise<void> {
      if (input.to.length === 0) return;
      const painel = `${base}/dashboard/settings/vinculos`;
      const resumo = input.approved
        ? describeApproved({ parentName: input.parentName, childName: input.childName, tipo: input.tipo })
        : `${input.parentName} não aprovou o pedido de vínculo de ${input.childName}.`;
      const motivo = !input.approved && input.motivo ? `Motivo informado: ${input.motivo}` : null;

      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: input.approved ? "Vínculo entre igrejas aprovado" : "Pedido de vínculo não aprovado",
            text: [resumo, motivo, `Veja no painel: ${painel}`].filter(Boolean).join("\n\n"),
            html: [
              `<p>${escapeHtml(resumo)}</p>`,
              motivo ? `<p>${escapeHtml(motivo)}</p>` : "",
              `<p><a href="${painel}">Abrir vínculos no painel</a></p>`,
            ]
              .filter(Boolean)
              .join("\n"),
          }),
        ),
      );
    },

    /** A superior mudou a posição da igreja na árvore: ela passa a ser vista por outro pastor. */
    async sendChurchLinkMoved(input: {
      to: string[];
      parentName: string;
      childName: string;
      tipo: ChurchLinkTipo;
    }): Promise<void> {
      if (input.to.length === 0) return;
      const painel = `${base}/dashboard/settings/vinculos`;
      const resumo = `A função de ${input.childName} na rede mudou: ${describeApproved({
        parentName: input.parentName,
        childName: input.childName,
        tipo: input.tipo,
      })}`;
      const aviso = "A igreja-mãe dela passa a ver a contagem de pedidos de oração e de visitas. Você pode desfazer o vínculo quando quiser.";

      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: "A função da sua igreja na rede mudou",
            text: `${resumo}\n\n${aviso}\n\nVeja no painel: ${painel}`,
            html: [
              `<p>${escapeHtml(resumo)}</p>`,
              `<p>${escapeHtml(aviso)}</p>`,
              `<p><a href="${painel}">Abrir vínculos no painel</a></p>`,
            ].join("\n"),
          }),
        ),
      );
    },

    /** Um dos lados desfez o vínculo: o outro precisa saber. */
    async sendChurchLinkEnded(input: {
      to: string[];
      endedByName: string;
      otherName: string;
    }): Promise<void> {
      if (input.to.length === 0) return;
      const painel = `${base}/dashboard/settings/vinculos`;
      const resumo = `${input.endedByName} desfez o vínculo com ${input.otherName}. A igreja voltou a ser independente.`;

      await Promise.all(
        input.to.map((to) =>
          provider.send({
            to,
            subject: "Vínculo entre igrejas desfeito",
            text: `${resumo}\n\nVeja no painel: ${painel}`,
            html: `<p>${escapeHtml(resumo)}</p>\n<p><a href="${painel}">Abrir vínculos no painel</a></p>`,
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
