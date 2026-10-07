import { redirect } from "next/navigation";

/**
 * A antiga tela "Assinatura" (planos e assentos do kit inicial) saiu do
 * produto: a igreja paga uma mensalidade única. Quem tiver o endereço antigo
 * guardado cai na tela certa.
 */
export default function BillingPage() {
  redirect("/dashboard/mensalidade");
}
