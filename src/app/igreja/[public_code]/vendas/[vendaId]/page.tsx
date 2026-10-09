import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { z } from "zod";
import { brand } from "@/config/brand";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { PedidoVendaForm } from "@/features/vendas/components/pedido-venda-form";
import { formatarData } from "@/lib/acompanhamento";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import { normalizeSocialLinks } from "@/lib/churchPublicPage";
import { loadPublicChurch } from "@/server/publicChurch";
import { getVendasPublicasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

type Params = { params: Promise<{ public_code: string; vendaId: string }> };

async function carregar(publicCode: string, vendaId: string) {
  // Id que não é uuid nem chega ao banco.
  if (!z.uuid().safeParse(vendaId).success) return null;
  const igreja = await loadPublicChurch(publicCode);
  if (!igreja) return null;
  // Só vendas abertas e com a chave confirmada saem desta lista.
  const venda = (await (await getVendasPublicasService()).listar(igreja.church.id)).find((v) => v.id === vendaId);
  return venda ? { ...igreja, venda } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { public_code, vendaId } = await params;
  const dados = await carregar(public_code, vendaId);
  if (!dados) return { title: "Venda" };
  return {
    title: `${dados.venda.titulo} · ${formatChurchName(dados.church.name, dados.church.sobrenome)}`,
    description: dados.venda.descricao?.slice(0, 160) ?? `${formatCents(dados.venda.precoCents)} cada.`,
  };
}

export default async function ChurchVendaPage({ params }: Params) {
  const { public_code, vendaId } = await params;
  const dados = await carregar(public_code, vendaId);
  if (!dados) notFound();
  const { church, theme, accent, venda } = dados;
  const base = caminhoDaIgreja(church.public_code);
  const whatsapp = normalizeSocialLinks(church.social_links).find((r) => r.kind === "whatsapp");

  return (
    <PublicShell theme={theme} accent={accent}>
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-10">
          <Link
            href={`${base}/vendas`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--pg-hero-muted)] hover:text-[var(--pg-hero-text)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Todas as vendas
          </Link>
          <p className="mt-8 text-sm font-medium text-[var(--pg-hero-muted)]">
            {formatChurchName(church.name, church.sobrenome)}
          </p>
          <h1
            className={`${fonteTitulos.className} mt-1 text-3xl leading-tight font-bold text-balance text-[var(--pg-hero-text)]`}
          >
            {venda.titulo}
          </h1>
          <p className="mt-2 text-lg font-semibold text-[var(--pg-hero-text)]">{formatCents(venda.precoCents)} cada</p>
          {venda.encerraEm ? (
            <p className="text-sm text-[var(--pg-hero-muted)]">Pedidos até {formatarData(venda.encerraEm)}</p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-8">
        {venda.descricao ? (
          <p className="text-base leading-7 whitespace-pre-line text-[var(--pg-text)]">{venda.descricao}</p>
        ) : null}

        <section className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5">
          <h2 className={`${fonteTitulos.className} flex items-center gap-2 text-xl font-bold`}>
            <ShoppingBag className="size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            Fazer pedido
          </h2>
          <div className="mt-4">
            <PedidoVendaForm venda={venda} whatsappHref={whatsapp?.href ?? null} />
          </div>
        </section>
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
