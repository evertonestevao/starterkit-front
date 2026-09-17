import Link from "next/link";
import { HandHeart } from "lucide-react";
import { brand } from "@/config/brand";

/** Casca das telas de entrada do patrocinador (login, conta, confirmação). */
export default function SponsorEntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-2 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <p className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground">
        <HandHeart className="size-4 text-primary" aria-hidden />
        Área do patrocinador
      </p>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
