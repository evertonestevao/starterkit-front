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

export const publicVisitorSchema = z.object({
  churchId: churchIdSchema,
  name: nomeObrigatorio,
  contact: contatoSchema,
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

