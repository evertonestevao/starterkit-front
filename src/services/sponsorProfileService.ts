import { phoneSchema, sponsorProfileChangeSchema } from "@/features/sponsor/schemas";
import { AppError, toValidationError } from "@/lib/errors";
import { EXTENSAO_POR_TIPO, MAX_LOGO_BYTES, sniffImageType } from "@/lib/imageValidation";
import { sameSponsorLink, sponsorLinkHref, type SponsorLink } from "@/lib/sponsorLink";
import type { SponsorProfileChange } from "@/types/sponsorship";

/**
 * Alteração de perfil do patrocinador — nome, logo e link.
 *
 * Esses três campos aparecem na página PÚBLICA da igreja, então não podem ser
 * escritos direto pelo dono da conta: uma conta invadida trocaria o logo por
 * qualquer coisa e aquilo apareceria na hora na página que a igreja divulga.
 * O pedido fica parado até a moderação da plataforma decidir; a conta segue
 * exibindo o valor antigo até lá.
 *
 * O telefone continua editável direto: não aparece em página nenhuma.
 */

export interface SponsorProfileAccount {
  id: string;
  /** Dono da conta no Auth: é a pasta dele no storage do logo. */
  userId: string;
  displayName: string;
  logoUrl: string | null;
  /** Destino aprovado da logo (site ou WhatsApp); null = sem link. */
  link: SponsorLink | null;
  email: string;
  securityHoldAt: string | null;
}

export interface SponsorProfileRepository {
  getMyAccount(): Promise<SponsorProfileAccount | null>;
  getMyPendingChange(): Promise<SponsorProfileChange | null>;
  requestChange(input: {
    displayName: string | null;
    logoPath: string | null;
    /** null = não mexeu no link; `{ value: null }` = remover o link. */
    link: { value: SponsorLink | null } | null;
    tokenHash: string;
    expiresAt: string;
  }): Promise<string>;
  cancelByToken(tokenHash: string): Promise<boolean>;
  updatePhone(phone: string | null): Promise<void>;
}

/** Arquivo cru vindo do formulário, antes de qualquer confiança. */
export interface LogoUpload {
  bytes: Uint8Array;
  /** O que o navegador declarou. Só serve para mensagem de erro. */
  declaredType: string;
}

export interface LogoStorage {
  upload(input: { path: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  publicUrl(path: string): string;
}

export interface SponsorProfileNotifier {
  /** Para o dono da conta: "pedimos isso; se não foi você, desfaça". */
  sendChangeRequested(input: {
    to: string;
    displayNameBefore: string;
    displayNameAfter: string | null;
    logoChanged: boolean;
    /** null = não mexeu; `href: null` = o link foi removido. */
    linkChange: { href: string | null } | null;
    undoUrl: string;
  }): Promise<void>;
  /** Para a moderação: tem coisa na fila. */
  sendStaffAlert(input: { subject: string; lines: string[] }): Promise<void>;
}

interface Deps {
  repo: SponsorProfileRepository;
  notifier: SponsorProfileNotifier;
  storage: LogoStorage;
  appUrl: string;
  /** Nome do arquivo no storage; injetado para o teste não depender de sorte. */
  makeFileId?: () => string;
  /** Gera o token do link "não fui eu" (texto puro, vai só no email). */
  makeToken: () => string;
  /** O banco guarda só o hash: vazamento da tabela não vira link válido. */
  hashToken: (token: string) => string;
  now?: () => Date;
}

/** Trinta dias: o email pode ficar semanas sem ser aberto. */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSponsorProfileService({
  repo,
  notifier,
  storage,
  appUrl,
  makeToken,
  hashToken,
  makeFileId = () => crypto.randomUUID(),
  now = () => new Date(),
}: Deps) {
  const base = appUrl.replace(/\/+$/, "");

  /**
   * Valida e guarda o arquivo. O tipo sai dos BYTES: o `Content-Type` e a
   * extensão são escolhidos por quem envia, então checá-los não decide nada.
   */
  async function guardarLogo(account: SponsorProfileAccount, logo: LogoUpload): Promise<string> {
    if (logo.bytes.length === 0) {
      throw new AppError("validation_error", "O arquivo do logo chegou vazio.");
    }
    if (logo.bytes.length > MAX_LOGO_BYTES) {
      throw new AppError("validation_error", "O logo precisa ter no máximo 1 MB.");
    }

    const tipo = sniffImageType(logo.bytes);
    if (!tipo) {
      throw new AppError(
        "validation_error",
        "Envie o logo em PNG, JPG ou WebP. Outros formatos não são aceitos.",
      );
    }

    const path = `pendente/${account.userId}/${makeFileId()}.${EXTENSAO_POR_TIPO[tipo]}`;
    await storage.upload({ path, bytes: logo.bytes, contentType: tipo });
    return path;
  }

  async function requireAccount(): Promise<SponsorProfileAccount> {
    const account = await repo.getMyAccount();
    if (!account) {
      throw new AppError("not_found", "Cadastro de patrocinador não encontrado.");
    }
    return account;
  }

  return {
    async getMyProfile(): Promise<{
      account: SponsorProfileAccount;
      pending: SponsorProfileChange | null;
      /** URL do logo enviado que espera conferência, para a pessoa ver o que mandou. */
      pendingLogoUrl: string | null;
    }> {
      const account = await requireAccount();
      const pending = await repo.getMyPendingChange();
      return {
        account,
        pending,
        pendingLogoUrl: pending?.novo_logo_path ? storage.publicUrl(pending.novo_logo_path) : null,
      };
    },

    /**
     * Pede a alteração. Devolve `false` quando não havia nada para mudar —
     * salvar o mesmo nome de novo não deve virar fila para alguém julgar.
     */
    async requestChange(input: unknown, logo?: LogoUpload | null): Promise<boolean> {
      const parsed = sponsorProfileChangeSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);

      const account = await requireAccount();
      if (account.securityHoldAt) {
        throw new AppError(
          "forbidden",
          "Sua conta está bloqueada por segurança. Fale com o suporte para liberar alterações.",
        );
      }

      const nome = parsed.data.displayName ?? null;
      const nomeMudou = nome !== null && nome !== account.displayName;

      // O arquivo sobe ANTES do pedido existir, na pasta pendente do próprio
      // usuário. Se o pedido falhar, sobra um arquivo órfão que ninguém
      // referencia — preferível ao contrário, um pedido apontando para nada.
      let logoPath: string | null = parsed.data.logoPath ?? null;
      if (logo) {
        logoPath = await guardarLogo(account, logo);
      }

      // `undefined` = o formulário nem trouxe o campo; string vazia = remover.
      const linkPedido = parsed.data.link;
      const linkMudou = linkPedido !== undefined && !sameSponsorLink(linkPedido, account.link);

      if (!nomeMudou && !logoPath && !linkMudou) return false;
      const linkChange = linkMudou
        ? { href: linkPedido ? sponsorLinkHref(linkPedido) : null }
        : null;

      const token = makeToken();
      const expiresAt = new Date(now().getTime() + TOKEN_TTL_MS).toISOString();
      await repo.requestChange({
        displayName: nomeMudou ? nome : null,
        logoPath,
        link: linkMudou ? { value: linkPedido ?? null } : null,
        tokenHash: hashToken(token),
        expiresAt,
      });

      // O email vai para o endereço da CONTA, não para um informado no
      // formulário: é ele que prova a posse quando o clique for de outra
      // pessoa.
      await notifier.sendChangeRequested({
        to: account.email,
        displayNameBefore: account.displayName,
        displayNameAfter: nomeMudou ? nome : null,
        logoChanged: Boolean(logoPath),
        linkChange,
        undoUrl: `${base}/patrocinador/alteracao/${token}`,
      });

      await notifier.sendStaffAlert({
        subject: "Alteração de patrocinador esperando aprovação",
        lines: [
          `Patrocinador: ${account.displayName} (${account.email})`,
          nomeMudou ? `Novo nome: ${nome}` : "Nome: sem alteração",
          logoPath ? "Logo: novo arquivo enviado" : "Logo: sem alteração",
          linkChange
            ? `Link da logo: ${linkChange.href ?? "removido"}`
            : "Link da logo: sem alteração",
          `Aprovar ou recusar: ${base}/plataforma/alteracoes`,
        ],
      });

      return true;
    },

    /** Telefone não aparece em página pública: salva direto, sem moderação. */
    async updatePhone(phone: unknown): Promise<void> {
      const parsed = phoneSchema.safeParse(typeof phone === "string" ? phone : "");
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await requireAccount();
      await repo.updatePhone(parsed.data);
    },

    /**
     * "Não fui eu", clicado no email. Sem sessão: quem prova ser o dono é
     * quem tem o token. Resposta é sempre a mesma para token inválido ou
     * expirado — não confirmamos a existência de nada para quem chutou.
     */
    async undoByToken(token: string): Promise<boolean> {
      const limpo = typeof token === "string" ? token.trim() : "";
      if (limpo.length < 20) return false;

      const desfeito = await repo.cancelByToken(hashToken(limpo));
      if (desfeito) {
        await notifier.sendStaffAlert({
          subject: "Patrocinador acionou “não fui eu”",
          lines: [
            "Uma alteração de perfil foi desfeita pelo dono do email e a conta ficou bloqueada.",
            "Pode ser conta invadida — confira antes de liberar.",
            `${base}/plataforma/alteracoes`,
          ],
        });
      }
      return desfeito;
    },
  };
}

export type SponsorProfileService = ReturnType<typeof createSponsorProfileService>;
