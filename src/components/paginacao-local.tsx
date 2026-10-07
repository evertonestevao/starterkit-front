"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Paginação de lista que já está no navegador (filtrada na própria tela). É a
 * irmã do `PaginationControls`, que troca de página pela URL. Renderiza nada
 * quando cabe tudo numa página.
 */
export function PaginacaoLocal({
  pagina,
  totalPaginas,
  total,
  onMudar,
  rotulo = "registro",
  rotuloPlural = `${rotulo}s`,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  onMudar: (pagina: number) => void;
  /** Nome do item no singular ("aluno"). */
  rotulo?: string;
  /** Plural, quando não é só somar um "s". */
  rotuloPlural?: string;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginação">
      <span className="text-sm text-muted-foreground">
        Página {pagina} de {totalPaginas} · {total} {total === 1 ? rotulo : rotuloPlural}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagina >= totalPaginas}
          onClick={() => onMudar(pagina + 1)}
        >
          Próxima
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
