import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Church } from "lucide-react";
import { brand } from "@/config/brand";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { RedeIgrejas } from "@/features/church/components/rede-igrejas";
import { formatChurchName } from "@/lib/churchName";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { getNomesNiveis } from "@/server/niveisRede";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

type Params = { params: Promise<{ public_code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const carregado = await loadPublicChurch((await params).public_code);
  if (!carregado) return { title: "Nossas igrejas" };
  const nome = formatChurchName(carregado.church.name, carregado.church.sobrenome);
  return { title: `Nossas igrejas · ${nome}`, description: `As igrejas ligadas à ${nome}.` };
}

/**
 * "Nossas igrejas": as igrejas ligadas a uma sede, com busca. Fica numa tela
 * própria (e não na página da sede) porque um ministério pode ter centenas
 * delas. Só existe para a igreja do topo que tem igrejas abaixo; cada item
 * abre a página daquela igreja.
 */
export default async function ChurchNetworkPage({ params }: Params) {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code);
  if (!carregado || carregado.church.parent_id !== null) notFound();
  const { church, theme, accent } = carregado;

  const [igrejas, nomes] = await Promise.all([
    (await getPublicChurchRepository()).listNetworkChurches(church.id),
    getNomesNiveis(church.id),
  ]);
  if (igrejas.length === 0) notFound();
  const base = caminhoDaIgreja(church.public_code);

  return (
    <PublicShell theme={theme} accent={accent}>
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-10">
          <Link
            href={base}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--pg-hero-muted)] hover:text-[var(--pg-hero-text)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {formatChurchName(church.name, church.sobrenome)}
          </Link>
          <h1
            className={`${fonteTitulos.className} mt-8 flex items-center gap-2.5 text-3xl font-bold text-[var(--pg-hero-text)]`}
          >
            <Church className="size-7 shrink-0 text-[var(--pg-hero-accent)]" aria-hidden />
            <span>
              Nossas <span className="text-[var(--pg-hero-accent)]">igrejas</span>
            </span>
          </h1>
          <p className="mt-2 text-base text-[var(--pg-hero-muted)]">
            {igrejas.length === 1 ? "1 igreja ligada" : `${igrejas.length} igrejas ligadas`} a esta. Toque para abrir a
            página de cada uma, com os horários, eventos e campanhas dela.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-5 py-8">
        <RedeIgrejas igrejas={igrejas} nomes={nomes} />
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
