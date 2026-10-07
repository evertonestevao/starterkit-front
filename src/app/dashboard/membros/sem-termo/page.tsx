import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoVoltar } from "@/components/botao-voltar";
import { PaginationControls } from "@/components/pagination-controls";
import { paginaDaUrl, paginar } from "@/lib/paginacao";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";

export const metadata: Metadata = { title: "Membros sem termo" };

/** Membros por página. */
const POR_PAGINA = 30;

/**
 * Membros ativos que ainda não têm termo de consentimento registrado, para a
 * secretaria ir colhendo as assinaturas. Nada é bloqueado para eles — só foto
 * e carteirinha exigem o termo.
 */
export default async function MembrosSemTermoPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor) notFound();

  const todos = await (await getCarteirinhaService()).semTermo(actor);
  const pag = paginar(todos, paginaDaUrl((await searchParams).page), POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <BotaoVoltar href="/dashboard/membros" />
      <div>
        <h3 className="text-lg font-semibold">Sem termo de consentimento</h3>
        <p className="text-sm text-muted-foreground">
          {todos.length === 0
            ? "Todos os membros ativos têm termo registrado."
            : `${todos.length} membro${todos.length === 1 ? "" : "s"} ativo${todos.length === 1 ? "" : "s"} sem termo. Abra a ficha, imprima o termo, colha a assinatura e registre.`}
        </p>
      </div>
      {pag.itens.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {pag.itens.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium">{m.nome}</span>
              <span className="flex shrink-0 gap-3">
                <a
                  href={`/dashboard/membros/${m.id}/termo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Imprimir termo
                </a>
                <Link href={`/dashboard/membros/${m.id}`} className="text-primary hover:underline">
                  Abrir ficha
                </Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <PaginationControls
        page={pag.pagina}
        pageSize={POR_PAGINA}
        total={pag.total}
        basePath="/dashboard/membros/sem-termo"
      />
    </div>
  );
}
