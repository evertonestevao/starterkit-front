import { redirect } from "next/navigation";
import { getActiveTenant } from "@/server/tenant";
import CartaoPage from "../../tesouraria/cartao/page";

export { metadata } from "../../tesouraria/cartao/page";

/** Endereço antigo: com a Tesouraria ligada, o cartão mora lá. */
export default async function ReceivingSettingsPage() {
  const { active } = await getActiveTenant();
  if (active?.modulosAtivos.includes("tesouraria")) redirect("/dashboard/tesouraria/cartao");
  return <CartaoPage />;
}
