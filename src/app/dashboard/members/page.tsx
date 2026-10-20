import { redirect } from "next/navigation";

/**
 * "Pessoas" virou "Membros": quem tem login aparece em Membros, com o acesso
 * gerenciado na ficha da pessoa. O endereço antigo segue funcionando.
 */
export default function MembersPage() {
  redirect("/dashboard/membros");
}
