import Link from "next/link";
import { brand } from "@/config/brand";

/** Casca simples da página do link de confirmação: quem abre vem do e-mail, sem entrar no painel. */
export default function ConfirmarPixLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
