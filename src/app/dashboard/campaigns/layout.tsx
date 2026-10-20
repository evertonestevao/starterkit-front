import { exigeMenu } from "@/server/menuPermissoes";
import { AvisoDoacoes } from "@/features/church/components/aviso-doacoes";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigeMenu("campaigns");
  return (
    <>
      <AvisoDoacoes />
      {children}
    </>
  );
}
