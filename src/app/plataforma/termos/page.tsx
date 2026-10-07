import type { Metadata } from "next";
import Link from "next/link";
import { TermsEditor } from "@/features/platform/components/terms-editor";
import { cn } from "@/lib/utils";
import { NOME_DO_PUBLICO, PUBLICOS_DOS_TERMOS, isPublicoDosTermos, type PublicoDosTermos } from "@/lib/termos";
import { exigePlatformStaff, getPlatformTermsService } from "@/server/platform";

export const metadata: Metadata = { title: "Termos de Uso" };

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * Termos de Uso pela moderação. Só ela chega aqui (o layout barra), e o banco
 * confere de novo: a publicação é uma função que exige `platform_staff` e
 * registra quem publicou.
 */
export default async function PlatformTermsPage({ searchParams }: { searchParams: Promise<{ publico?: string }> }) {
  await exigePlatformStaff();
  const pedido = (await searchParams).publico ?? "";
  const audience: PublicoDosTermos = isPublicoDosTermos(pedido) ? pedido : "igreja";
  const { vigente, historico, proximaVersao } = await (await getPlatformTermsService()).carregar(audience);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Termos de Uso</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Cada público tem o seu documento. Uma versão publicada não é alterada: editar é publicar a versão seguinte, e
          quem aceitou a anterior aceita de novo no próximo acesso.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PUBLICOS_DOS_TERMOS.map((p) => (
          <Link
            key={p}
            href={`/plataforma/termos?publico=${p}`}
            aria-current={p === audience ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              p === audience ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {NOME_DO_PUBLICO[p]}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {vigente ? (
            <>
              Vigente: Versão {vigente.version}, de {dataHora(vigente.publishedAt)} ·{" "}
              <Link href={`/terms/${audience}`} target="_blank" className="underline underline-offset-4">
                ver a página pública
              </Link>
            </>
          ) : (
            "Nenhuma versão publicada para este público."
          )}
        </span>
      </div>

      {/* A chave remonta o editor quando uma versão nova entra: ele passa a partir do texto publicado. */}
      <TermsEditor
        key={`${audience}-${vigente?.version ?? 0}`}
        audience={audience}
        conteudoInicial={vigente?.content ?? ""}
        proximaVersao={proximaVersao}
      />

      {historico.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium">Histórico</h2>
          <ul className="mt-2 divide-y rounded-md border text-sm">
            {historico.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>Versão {v.version}</span>
                <span className="text-muted-foreground">
                  {dataHora(v.publishedAt)}
                  {v.isCurrent ? " · vigente" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
