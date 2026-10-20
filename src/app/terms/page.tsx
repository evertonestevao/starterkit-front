import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { createSupabaseTermsRepository } from "@/repositories/supabase/termsRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createTermsService } from "@/services/termsService";

export const metadata: Metadata = { title: "Termos de Uso" };

/** Página PÚBLICA com a versão vigente dos termos (linkada no onboarding). */
export default async function TermsPage() {
  const client = await getSupabaseServerClient();
  const terms = createTermsService(createSupabaseTermsRepository(client));
  const current = await terms.getCurrentTerms();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {brand.name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Termos de Uso</h1>
      {current ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Versão {current.version} · publicada em{" "}
            {new Date(current.published_at).toLocaleDateString("pt-BR")}
          </p>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">
            {current.content}
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma versão de termos publicada.
        </p>
      )}
    </div>
  );
}
