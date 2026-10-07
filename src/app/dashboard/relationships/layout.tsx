import { exigeMenu } from "@/server/menuPermissoes";

/** Menu desligado para a pessoa (Configurações → Acessos) responde 404. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigeMenu("relationships");
  return children;
}
