import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { features } from "@/config/features";
import { TermsDocument } from "@/features/terms/components/terms-document";
import { createSupabaseTermsRepository } from "@/repositories/supabase/termsRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createTermsService, type TermsAudience } from "@/services/termsService";

/**
 * Termos por público. São contratos diferentes: a igreja não paga e é
 * controladora dos dados da comunidade; o patrocinador paga, é consumidor e
 * tem direito de arrependimento. Cada um lê só o que é dele, e cada página
 * aponta para a outra — quem chegou no documento errado não fica preso.
 *
 * Página PÚBLICA: tem de abrir sem login, inclusive para quem ainda está
 * decidindo se assina.
 */

const PUBLICOS: Record<TermsAudience, { titulo: string; outro: TermsAudience; chamada: string }> = {
  igreja: {
    titulo: "Termos de Uso — Igrejas",
    outro: "patrocinador",
    chamada: "É patrocinador? Veja os termos do patrocínio",
  },
  patrocinador: {
    titulo: "Termos de Uso — Patrocinadores",
    outro: "igreja",
    chamada: "Representa uma igreja? Veja os termos das igrejas",
  },
};

function parseAudience(valor: string): TermsAudience | null {
  return valor === "igreja" || valor === "patrocinador" ? valor : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ audience: string }>;
}): Promise<Metadata> {
  const audience = parseAudience((await params).audience);
  return { title: audience ? PUBLICOS[audience].titulo : "Termos de Uso" };
}

export default async function TermsByAudiencePage({
  params,
}: {
  params: Promise<{ audience: string }>;
}) {
  const audience = parseAudience((await params).audience);
  if (!audience) notFound();

  const client = await getSupabaseServerClient();
  const terms = createTermsService(createSupabaseTermsRepository(client));
  const current = await terms.getCurrentTerms(audience);
  const info = PUBLICOS[audience];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {brand.name}
      </Link>

      {current ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Versão {current.version} · publicada em{" "}
            {new Date(current.published_at).toLocaleDateString("pt-BR")}
          </p>
          <TermsDocument content={current.content} />
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma versão de termos publicada para este público.
        </p>
      )}

      {/* Patrocínio fora das telas: a igreja não é levada aos termos do patrocinador. */}
      {audience === "patrocinador" || features.patrocinioVisivel ? (
        <p className="mt-10 border-t pt-6 text-sm">
          <Link
            href={`/terms/${info.outro}`}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {info.chamada}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
