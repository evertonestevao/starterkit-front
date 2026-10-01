import { AvisoDoacoes } from "@/features/church/components/aviso-doacoes";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AvisoDoacoes />
      {children}
    </>
  );
}
