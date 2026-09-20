import { z } from "zod";
import { normalizeSocialLinks, type SocialKind } from "@/lib/churchPublicPage";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";

/**
 * A igreja editando a própria página: nome, endereço, redes sociais, logo e o
 * endereço público (`public_code`).
 *
 * Isso NÃO passa por moderação, ao contrário do nome e do logo do
 * patrocinador. A diferença é de quem é o conteúdo: o patrocinador escreve na
 * página de OUTRA pessoa (a igreja), e por isso a plataforma entra no meio;
 * aqui a igreja escreve na página dela. Exigir aprovação para um pastor
 * corrigir o próprio endereço seria transformar a moderação em cartório.
 */

export const REDES: SocialKind[] = ["instagram", "whatsapp", "youtube", "facebook", "site"];

export interface ChurchProfile {
  id: string;
  name: string;
  publicCode: string;
  address: string | null;
  logoUrl: string | null;
  socialLinks: Record<string, string>;
}

export interface ChurchProfileRepository {
  listCompanyChurches(companyId: string): Promise<ChurchProfile[]>;
  updateProfile(input: {
    churchId: string;
    companyId: string;
    name: string;
    address: string | null;
    publicCode: string;
    socialLinks: Record<string, string>;
  }): Promise<void>;
  updateLogo(input: { churchId: string; companyId: string; logoUrl: string }): Promise<void>;
}

export interface ProfileAuditRecorder {
  record(input: {
    companyId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface ProfileActor {
  companyId: string;
  role: RoleCode;
  userId: string;
}

const QUEM_EDITA: RoleCode[] = ["owner", "admin"];

export function canEditChurchProfile(role: RoleCode): boolean {
  return QUEM_EDITA.includes(role);
}

/**
 * O endereço público vira URL e vai impresso no QR Code e gravado na tag NFC.
 * Formato conferido aqui e repetido por CHECK no banco.
 */
export const publicCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O endereço precisa de pelo menos 3 caracteres")
  .max(40, "Endereço muito longo")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use só letras sem acento, números e hífen — por exemplo: betel-lins",
  );

const profileSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  name: z.string().trim().min(2, "Informe o nome da igreja").max(120, "Nome muito longo"),
  address: z
    .string()
    .trim()
    .max(200, "Endereço muito longo")
    .transform((v) => (v === "" ? null : v)),
  publicCode: publicCodeSchema,
  instagram: z.string().trim().max(200, "Valor muito longo"),
  whatsapp: z.string().trim().max(200, "Valor muito longo"),
  youtube: z.string().trim().max(200, "Valor muito longo"),
  facebook: z.string().trim().max(200, "Valor muito longo"),
  site: z.string().trim().max(200, "Valor muito longo"),
});

/**
 * Cada rede é validada pelo MESMO caminho que a página pública usa para
 * montar o link. Assim não existe valor que o formulário aceita e a página
 * depois ignora em silêncio — quem digita errado descobre na hora.
 */
function validarRedes(entrada: Record<SocialKind, string>): Record<string, string> {
  const validas: Record<string, string> = {};
  for (const rede of REDES) {
    const valor = entrada[rede];
    if (!valor) continue;
    if (normalizeSocialLinks({ [rede]: valor }).length === 0) {
      throw new AppError(
        "validation_error",
        rede === "whatsapp"
          ? "WhatsApp inválido. Use o número com DDD, por exemplo 14999998888."
          : rede === "instagram"
            ? "Instagram inválido. Use o @usuario ou o endereço completo do perfil."
            : `Endereço inválido em ${rede}. Comece com https://`,
      );
    }
    validas[rede] = valor;
  }
  return validas;
}

export function createChurchProfileService(deps: {
  repo: ChurchProfileRepository;
  audit?: ProfileAuditRecorder;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const log = deps.log ?? console;

  function exigePermissao(actor: ProfileActor) {
    if (!canEditChurchProfile(actor.role)) {
      throw new AppError("forbidden", "Só quem administra a igreja pode editar a página dela.");
    }
  }

  return {
    list(companyId: string): Promise<ChurchProfile[]> {
      if (!companyId) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
      return deps.repo.listCompanyChurches(companyId);
    },

    async save(actor: ProfileActor, input: unknown): Promise<void> {
      exigePermissao(actor);

      const parsed = profileSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      const igreja = igrejas.find((c) => c.id === dados.churchId);
      if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");

      const socialLinks = validarRedes({
        instagram: dados.instagram,
        whatsapp: dados.whatsapp,
        youtube: dados.youtube,
        facebook: dados.facebook,
        site: dados.site,
      });

      await deps.repo.updateProfile({
        churchId: dados.churchId,
        companyId: actor.companyId,
        name: dados.name,
        address: dados.address,
        publicCode: dados.publicCode,
        socialLinks,
      });

      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: "church.profile.updated",
          entityType: "church",
          entityId: dados.churchId,
          metadata:
            // A troca do endereço público invalida QR e tag já impressos, então
            // fica registrada com o valor antigo, não só com o novo.
            igreja.publicCode !== dados.publicCode
              ? { public_code_anterior: igreja.publicCode, public_code_novo: dados.publicCode }
              : { nome: dados.name },
        })
        .catch((err) => log.error("[church-profile] falha ao registrar auditoria", err));
    },

    /** Grava a URL do logo já enviado ao storage. */
    async setLogo(actor: ProfileActor, churchId: unknown, logoUrl: string): Promise<void> {
      exigePermissao(actor);
      const id = z.uuid().safeParse(churchId);
      if (!id.success) throw new AppError("validation_error", "Igreja inválida.");

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      if (!igrejas.some((c) => c.id === id.data)) {
        throw new AppError("not_found", "Igreja não encontrada.");
      }

      await deps.repo.updateLogo({ churchId: id.data, companyId: actor.companyId, logoUrl });

      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: "church.logo.updated",
          entityType: "church",
          entityId: id.data,
          metadata: {},
        })
        .catch((err) => log.error("[church-profile] falha ao registrar auditoria", err));
    },
  };
}

export type ChurchProfileService = ReturnType<typeof createChurchProfileService>;
