import { redirect } from "next/navigation";
import { getActiveTenant } from "@/server/tenant";
import ChavePixPage from "../../tesouraria/pix/page";

export { metadata } from "../../tesouraria/pix/page";

/** Endereço antigo: com a Tesouraria ligada, a chave PIX mora lá. */
export default async function PixSettingsPage() {
  const { active } = await getActiveTenant();
  if (active?.modulosAtivos.includes("tesouraria")) redirect("/dashboard/tesouraria/pix");
  return <ChavePixPage />;
}
