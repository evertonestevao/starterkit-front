import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Paginação por links (?page=N): funciona sem JS e joga o estado na URL.
 * Renderiza nada quando cabe tudo numa página.
 */
export function PaginationControls({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  /** Outros filtros da URL (ex.: ?evento=), preservados ao trocar de página. */
  params?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
    qs.set("page", String(target));
    return `${basePath}?${qs.toString()}`;
  };

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Paginação">
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages} · {total} registro{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          nativeButton={false}
          render={page <= 1 ? <span aria-disabled /> : <Link href={href(page - 1)} rel="prev" />}
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          nativeButton={false}
          render={
            page >= totalPages ? <span aria-disabled /> : <Link href={href(page + 1)} rel="next" />
          }
        >
          Próxima
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
