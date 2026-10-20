import { z } from "zod";

/**
 * Schemas do domínio próprio, compartilhados entre client (feedback imediato)
 * e server (fonte de verdade — a action valida de novo).
 *
 * A validação FINA do hostname (formato, apex vs subdomínio, blocklist) mora em
 * `src/lib/domain` e roda no service: é regra de negócio, não de formulário.
 */

export const churchIdSchema = z.uuid("Igreja inválida");

export const customDomainSchema = z.object({
  churchId: churchIdSchema,
  domain: z
    .string()
    .trim()
    .min(4, "Informe o domínio da sua igreja")
    .max(253, "Domínio longo demais"),
});

export const churchDomainTargetSchema = z.object({
  churchId: churchIdSchema,
});

export type CustomDomainInput = z.infer<typeof customDomainSchema>;

/**
 * Formulários da página PÚBLICA da igreja. Quem envia não tem conta, então
 * os limites de tamanho são a única coisa entre um formulário aberto e um
 * pedido de oração de 10 MB — o banco não tinha teto.
 */
const contatoSchema = z
  .string()
  .trim()
  .min(5, "Deixe um WhatsApp, telefone ou email")
  .max(160, "Contato muito longo");

const nomeObrigatorio = z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo");

export const publicPrayerSchema = z.object({
  churchId: churchIdSchema,
  // Pedido de oração pode ser anônimo: muita gente só pede se não precisar se identificar.
  name: z
    .string()
    .trim()
    .max(120, "Nome muito longo")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  message: z
    .string()
    .trim()
    .min(3, "Escreva o seu pedido")
    .max(2000, "Seu pedido pode ter até 2.000 caracteres"),
});

/** Pedido de visita: telefone é obrigatório (é por ele que a igreja combina). */
export const publicVisitorSchema = z.object({
  churchId: churchIdSchema,
  name: nomeObrigatorio,
  contact: z
    .string()
    .trim()
    .max(20, "Telefone inválido")
    .refine((v) => {
      const digitos = v.replace(/\D/g, "").length;
      return digitos >= 10 && digitos <= 13;
    }, "Informe um telefone com DDD"),
  endereco: z
    .string()
    .trim()
    .max(300, "Endereço muito longo")
    .transform((v) => v || null)
    .optional()
    .transform((v) => v ?? null),
  mensagem: z
    .string()
    .trim()
    .max(1000, "Mensagem muito longa")
    .transform((v) => v || null)
    .optional()
    .transform((v) => v ?? null),
});

/**
 * Inscrição aponta para um evento publicado — não existe mais o campo livre
 * "qual evento?". O nome do evento sai do banco, não do visitante.
 */
export const publicEventSignupSchema = z.object({
  eventId: z.uuid("Evento inválido"),
  personName: nomeObrigatorio,
  contact: contatoSchema,
});

/**
 * Criação de evento pelo painel. Chega cru do formulário (texto); datas e
 * preço são convertidos no service, que também confere que a igreja é da
 * empresa ativa e que o início é no futuro.
 */
export const createChurchEventSchema = z.object({
  churchId: churchIdSchema,
  titulo: z.string().trim().min(2, "Dê um nome ao evento").max(120, "Nome muito longo"),
  descricao: z
    .string()
    .trim()
    .max(4000, "A descrição pode ter até 4.000 caracteres")
    .transform((v) => (v === "" ? null : v)),
  inicio: z.string().trim().min(1, "Informe quando o evento começa"),
  fim: z.string().trim(),
  local: z
    .string()
    .trim()
    .max(200, "Local muito longo")
    .transform((v) => (v === "" ? null : v)),
  preco: z.string().trim().max(20, "Valor inválido"),
  inscricoesAbertas: z.boolean(),
});

/** Edição de evento: os mesmos campos da criação, mais o id do evento. */
export const updateChurchEventSchema = createChurchEventSchema
  .omit({ churchId: true })
  .extend({ eventId: z.uuid("Evento inválido") });

/**
 * Item da programação (culto semanal ou especial). Semanal pede dia da
 * semana; especial pede data. A coerência entre os dois é conferida aqui e
 * repetida por CHECK no banco.
 */
export const createScheduleItemSchema = z
  .object({
    churchId: churchIdSchema,
    titulo: z.string().trim().min(2, "Dê um nome, ex.: Culto de celebração").max(80, "Nome muito longo"),
    tipo: z.enum(["semanal", "especial"], { error: "Escolha: toda semana ou data específica" }),
    diaSemana: z.string().trim(),
    data: z.string().trim(),
    hora: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe o horário, ex.: 19:30"),
    descricao: z
      .string()
      .trim()
      .max(500, "A descrição pode ter até 500 caracteres")
      .transform((v) => (v === "" ? null : v)),
    local: z
      .string()
      .trim()
      .max(200, "Local muito longo")
      .transform((v) => (v === "" ? null : v)),
    /** Se o culto aparece na chamada (Acompanhamento). Padrão: sim. */
    registraChamada: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "semanal" && !/^[0-6]$/.test(v.diaSemana)) {
      ctx.addIssue({ code: "custom", path: ["diaSemana"], message: "Escolha o dia da semana" });
    }
    if (v.tipo === "especial" && !/^\d{4}-\d{2}-\d{2}$/.test(v.data)) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "Escolha a data" });
    }
  });


/** Edição de item da programação: os mesmos campos, mais o id do item. */
export const updateScheduleItemSchema = z
  .object({
    itemId: z.uuid("Item inválido"),
    titulo: z.string().trim().min(2, "Dê um nome, ex.: Culto de celebração").max(80, "Nome muito longo"),
    tipo: z.enum(["semanal", "especial"], { error: "Escolha: toda semana ou data específica" }),
    diaSemana: z.string().trim(),
    data: z.string().trim(),
    hora: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe o horário, ex.: 19:30"),
    descricao: z
      .string()
      .trim()
      .max(500, "A descrição pode ter até 500 caracteres")
      .transform((v) => (v === "" ? null : v)),
    local: z
      .string()
      .trim()
      .max(200, "Local muito longo")
      .transform((v) => (v === "" ? null : v)),
    /** Se o culto aparece na chamada (Acompanhamento). Padrão: sim. */
    registraChamada: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "semanal" && !/^[0-6]$/.test(v.diaSemana)) {
      ctx.addIssue({ code: "custom", path: ["diaSemana"], message: "Escolha o dia da semana" });
    }
    if (v.tipo === "especial" && !/^\d{4}-\d{2}-\d{2}$/.test(v.data)) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "Escolha a data" });
    }
  });
