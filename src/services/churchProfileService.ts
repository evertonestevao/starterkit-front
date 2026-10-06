import { z } from "zod";
import { SUBPAGINAS_DA_IGREJA } from "@/lib/churchPaths";
import { CHURCH_SURNAME_MAX_LENGTH, normalizeSurname } from "@/lib/churchName";
import { normalizeSocialLinks, type SocialKind } from "@/lib/churchPublicPage";
import { AppError, toValidationError } from "@/lib/errors";
import { isChurchTheme, parseAccentColor, type ChurchTheme } from "@/lib/pageAppearance";
import type { RoleCode } from "@/types/database";

/**
 * A igreja editando a própria página: nome, endereço, redes sociais, logo, o
 * endereço público (`public_code`) e a aparência (tema e cor de destaque).
 *
 * Isso NÃO passa por moderação, ao contrário do nome e do logo do
 * patrocinador. A diferença é de quem é o conteúdo: o patrocinador escreve na
 * página de OUTRA pessoa (a igreja), e por isso a plataforma entra no meio;
 * aqui a igreja escreve na página dela. Exigir aprovação para um pastor
 * corrigir o próprio endereço seria transformar a moderação em cartório.
 */

export const REDES: SocialKind[] = ["instagram", "whatsapp", "youtube", "facebook", "site"];

/** Tema e cor de destaque, como a página pública os desenha. */
export interface PageAppearance {
  theme: ChurchTheme;
  /** #rrggbb; null = a cor padrão do tema. */
  accent: string | null;
}

export type AppearanceMode = "inherit" | "custom";

export interface ChurchProfile {
  id: string;
  /** Nome EFETIVO: o próprio, ou o da igreja superior quando `herdarNome`. */
  name: string;
  /** O nome que esta igreja escolheu (guardado mesmo enquanto ela herda o da superior). */
  nomeProprio: string;
  /** Opcional; sempre individual (nunca herdado). */
  sobrenome: string | null;
  herdarNome: boolean;
  /** Nome da igreja superior direta, para o "usar o nome de ...". Null sem superior. */
  parentName: string | null;
  /** O código da página DENTRO da rede (o que a pessoa escolhe). */
  publicCode: string;
  /** A chave completa, com a rede na frente quando há ("adipiranga~lins"). */
  chavePublica: string;
  /** Sede: o código dela é o endereço da rede e entra no endereço das igrejas ligadas. */
  ehSedeDeRede: boolean;
  address: string | null;
  /** Texto de apresentação, mostrado na página ("Sobre a igreja"). */
  sobre: string | null;
  /** A página pública está no ar? Igreja nova nasce com ela fora do ar. */
  paginaAtiva: boolean;
  logoUrl: string | null;
  socialLinks: Record<string, string>;
  /** Tem igreja-mãe? Só quem tem pode herdar a aparência dela. */
  hasParent: boolean;
  /** A escolha desta igreja. Em `inherit`, `own` guarda o que valia por último e não é usado. */
  appearanceMode: AppearanceMode;
  own: PageAppearance;
  /** O que a igreja-mãe (ou a mais próxima que personalizou) mostra; null sem mãe. */
  inherited: PageAppearance | null;
}

export interface ChurchProfileRepository {
  listCompanyChurches(companyId: string): Promise<ChurchProfile[]>;
  updateProfile(input: {
    churchId: string;
    companyId: string;
    /** O nome PRÓPRIO: o efetivo (`name`) é derivado pelo banco. */
    nomeProprio: string;
    sobrenome: string | null;
    herdarNome: boolean;
    address: string | null;
    sobre: string | null;
    publicCode: string;
    socialLinks: Record<string, string>;
  }): Promise<void>;
  updateLogo(input: { churchId: string; companyId: string; logoUrl: string }): Promise<void>;
  /** RPC definir_pagina_ativa: confere de novo quem administra. Lança not_found se a igreja não é de quem pede. */
  setPaginaAtiva(churchId: string, ativa: boolean): Promise<void>;
  /** `theme`/`accent` são ignorados em `inherit`: a igreja passa a usar os da mãe. */
  updateAppearance(input: {
    churchId: string;
    companyId: string;
    mode: AppearanceMode;
    theme: ChurchTheme;
    accent: string | null;
  }): Promise<void>;
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
/** Limite do "Sobre a igreja" (repetido por CHECK no banco). */
export const CHURCH_ABOUT_MAX_LENGTH = 1500;

export const publicCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O endereço precisa de pelo menos 3 caracteres")
  .max(40, "Endereço muito longo")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use só letras sem acento, números e hífen — por exemplo: betel-lins",
  )
  .refine((v) => !SUBPAGINAS_DA_IGREJA.includes(v), "Este endereço é reservado. Escolha outro.");

const profileSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  name: z.string().trim().min(2, "Informe o nome da igreja").max(120, "Nome muito longo"),
  sobrenome: z
    .string()
    .max(CHURCH_SURNAME_MAX_LENGTH, "Sobrenome muito longo")
    .transform((v) => normalizeSurname(v)),
  herdarNome: z.boolean(),
  address: z
    .string()
    .trim()
    .max(200, "Endereço muito longo")
    .transform((v) => (v === "" ? null : v)),
  publicCode: publicCodeSchema,
  // Texto simples (a página mostra sem interpretar HTML). Ausente = sem texto.
  sobre: z
    .string()
    .max(CHURCH_ABOUT_MAX_LENGTH, `O texto pode ter no máximo ${CHURCH_ABOUT_MAX_LENGTH} caracteres`)
    .optional()
    .transform((v) => (v ?? "").replace(/\r\n/g, "\n").trim() || null),
  instagram: z.string().trim().max(200, "Valor muito longo"),
  whatsapp: z.string().trim().max(200, "Valor muito longo"),
  youtube: z.string().trim().max(200, "Valor muito longo"),
  facebook: z.string().trim().max(200, "Valor muito longo"),
  site: z.string().trim().max(200, "Valor muito longo"),
});

const appearanceSchema = z
  .object({
    churchId: z.uuid("Igreja inválida"),
    mode: z.enum(["inherit", "custom"], { error: "Escolha como a página vai ficar" }),
    theme: z.string().trim(),
    accentColor: z.string(),
  })
  .transform((v, ctx) => {
    if (v.mode === "inherit") {
      return { churchId: v.churchId, mode: v.mode, theme: null, accent: null };
    }
    if (!isChurchTheme(v.theme)) {
      ctx.addIssue({ code: "custom", path: ["theme"], message: "Escolha um dos temas" });
      return z.NEVER;
    }
    const cor = parseAccentColor(v.accentColor);
    if (!cor.ok) {
      ctx.addIssue({ code: "custom", path: ["accentColor"], message: cor.message });
      return z.NEVER;
    }
    return { churchId: v.churchId, mode: v.mode, theme: v.theme, accent: cor.color };
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
    /** Coloca a página pública no ar, ou tira. Só quem administra a igreja. */
    async definirPaginaAtiva(actor: ProfileActor, churchId: unknown, ativa: boolean): Promise<{ nome: string }> {
      exigePermissao(actor);
      const id = z.uuid("Igreja inválida").safeParse(churchId);
      if (!id.success) throw toValidationError(id.error.issues);
      const igreja = (await deps.repo.listCompanyChurches(actor.companyId)).find((c) => c.id === id.data);
      if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");
      await deps.repo.setPaginaAtiva(id.data, ativa);
      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: ativa ? "church.pagina_publicada" : "church.pagina_fora_do_ar",
          entityType: "church",
          entityId: id.data,
          metadata: {},
        })
        .catch(() => undefined);
      return { nome: igreja.name };
    },

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
      if (dados.herdarNome && !igreja.hasParent) {
        throw new AppError("validation_error", "Esta igreja não tem uma igreja-mãe cujo nome herdar.");
      }

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
        nomeProprio: dados.name,
        sobrenome: dados.sobrenome,
        herdarNome: dados.herdarNome,
        address: dados.address,
        sobre: dados.sobre,
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
              : { nome: dados.name, sobrenome: dados.sobrenome, herdar_nome: dados.herdarNome },
        })
        .catch((err) => log.error("[church-profile] falha ao registrar auditoria", err));
    },

    /**
     * Tema e cor de destaque. `inherit` devolve a igreja à aparência da mãe;
     * `custom` grava a escolha desta. A cor chega já validada como #rrggbb —
     * ela vira atributo `style` na página pública.
     */
    async saveAppearance(actor: ProfileActor, input: unknown): Promise<void> {
      exigePermissao(actor);

      const parsed = appearanceSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;

      const igrejas = await deps.repo.listCompanyChurches(actor.companyId);
      const igreja = igrejas.find((c) => c.id === dados.churchId);
      if (!igreja) throw new AppError("not_found", "Igreja não encontrada.");
      if (dados.mode === "inherit" && !igreja.hasParent) {
        throw new AppError("validation_error", "Esta igreja não tem uma igreja-mãe para herdar.");
      }

      await deps.repo.updateAppearance({
        churchId: dados.churchId,
        companyId: actor.companyId,
        mode: dados.mode,
        theme: dados.theme ?? igreja.own.theme,
        accent: dados.accent,
      });

      await deps.audit
        ?.record({
          companyId: actor.companyId,
          userId: actor.userId,
          action: "church.appearance.updated",
          entityType: "church",
          entityId: dados.churchId,
          metadata: { modo: dados.mode, tema: dados.theme, cor: dados.accent },
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
