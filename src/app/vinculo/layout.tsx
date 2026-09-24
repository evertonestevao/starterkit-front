import Link from "next/link";
import { brand } from "@/config/brand";

/** Casca simples da página do link de vínculo: quem abre pode nem ter entrado no painel ainda. */
export default function ChurchLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
