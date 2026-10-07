import { redirect } from "next/navigation";

/**
 * A Liderança virou "membro com cargo": quem é o Pastor, o Diácono... é o
 * cargo dado na ficha do membro. O endereço antigo leva para Membros.
 */
export default function LiderancaPage() {
  redirect("/dashboard/membros");
}
