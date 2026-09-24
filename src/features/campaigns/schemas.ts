import { z } from "zod";

/**
 * Schemas de campanhas. Valores em dinheiro chegam como texto do formulário
 * (ex.: "1.500,00") e viram centavos no service, com `parseBrlToCents` — os
 * mesmos limites e o mesmo formato já usados em eventos.
 */

const valorOpcional = z.string().trim().max(20, "Valor inválido");

export const createCampaignSchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  titulo: z.string().trim().min(2, "Dê um nome à campanha").max(120, "Nome muito longo"),
  historia: z.string().trim().min(10, "Conte a história do projeto").max(8000, "História muito longa"),
  meta: valorOpcional,
  metodoRecebimento: z.enum(["pix", "gateway"], { error: "Escolha como vai receber as ofertas" }),
  mostrarProgresso: z.boolean(),
  permitirValorLivre: z.boolean(),
  valorSugerido1: valorOpcional,
  valorSugerido2: valorOpcional,
  valorSugerido3: valorOpcional,
  /** "1" | "2" | "3" | "" — qual dos três sugeridos vem pré-selecionado. */
  valorPadraoIndice: z.string().trim(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Edição: os mesmos campos da criação, mais o id — a igreja não muda. */
export const updateCampaignSchema = createCampaignSchema
  .omit({ churchId: true })
  .extend({ campaignId: z.uuid("Campanha inválida") });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignIdSchema = z.object({ campaignId: z.uuid("Campanha inválida") });

export const campaignFeedbackSchema = z.object({
  campaignId: z.uuid("Campanha inválida"),
  feedbackTexto: z
    .string()
    .trim()
    .max(4000, "O texto pode ter até 4.000 caracteres")
    .transform((v) => (v === "" ? null : v)),
});
export type CampaignFeedbackInput = z.infer<typeof campaignFeedbackSchema>;

export const donationIdSchema = z.object({ donationId: z.uuid("Doação inválida") });

/**
 * Doação pública. `telefone` fica sem `min` aqui: PIX exige (conferido no
 * service, porque é regra do método, não do campo), cartão não.
 */
export const publicCampaignDonationSchema = z.object({
  campaignId: z.uuid("Campanha inválida"),
  nome: z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo"),
  telefone: z.string().trim().max(20, "Telefone inválido"),
  valor: valorOpcional,
});
export type PublicCampaignDonationInput = z.infer<typeof publicCampaignDonationSchema>;
