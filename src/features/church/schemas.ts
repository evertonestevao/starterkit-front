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

