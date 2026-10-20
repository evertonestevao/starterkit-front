import Link from "next/link";
import { brand } from "@/config/brand";

/** Casca simples do link para assumir uma igreja: quem abre ainda pode nem ter conta. */
export default function AssumirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <Link href="/" className="mb-6 text-xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
