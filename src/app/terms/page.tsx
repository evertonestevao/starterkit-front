import { redirect } from "next/navigation";

/**
 * Endereço histórico dos termos. Antes havia um documento só; hoje há um por
 * público. Os links antigos (emails já enviados, aceites registrados) apontam
 * para cá, então isto redireciona em vez de quebrar.
 */
export default function TermsPage() {
  redirect("/terms/igreja");
}
