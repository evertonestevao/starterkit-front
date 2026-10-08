import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { brand } from "@/config/brand";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { formatarData } from "@/lib/acompanhamento";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import { loadPublicChurch } from "@/server/publicChurch";
import { getVendasPublicasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

type Params = { params: Promise<{ public_code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const carregado = await loadPublicChurch((await params).public_code);
  if (!carregado) return { title: "Vendas" };
  return { title: `Vendas · ${formatChurchName(carregado.church.name, carregado.church.sobrenome)}` };
}

/** Vendas abertas da igreja (camiseta, pastel, lanche). Só as com a chave Pix confirmada. */
export default async function ChurchVendasPage({ params }: Params) {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code);
  if (!carregado) notFound();
  const { church, theme, accent } = carregado;
  const vendas = await (await getVendasPublicasService()).listar(church.id);
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
            Voltar para a igreja
          </Link>
          <p className="mt-8 text-sm font-medium text-[var(--pg-hero-muted)]">
            {formatChurchName(church.name, church.sobrenome)}
          </p>
          <h1 className={`${fonteTitulos.className} mt-1 text-3xl font-bold text-[var(--pg-hero-text)]`}>Vendas</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-5 py-8">
        {vendas.length === 0 ? (
          <p className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5 text-center text-[var(--pg-muted)]">
            Nenhuma venda aberta no momento.
          </p>
        ) : (
          vendas.map((v) => (
            <Link
              key={v.id}
              href={`${base}/vendas/${v.id}`}
              className="flex items-center gap-3 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-4 transition-colors hover:border-[var(--pg-accent)]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
                <ShoppingBag className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words text-[var(--pg-text)]">{v.titulo}</span>
                <span className="block text-xs text-[var(--pg-muted)]">
                  {v.encerraEm ? `Pedidos até ${formatarData(v.encerraEm)}` : "Pedidos abertos"}
                  {v.disponivel !== null ? ` · restam ${v.disponivel}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-bold text-[var(--pg-text)] tabular-nums">{formatCents(v.precoCents)}</span>
            </Link>
          ))
        )}
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
