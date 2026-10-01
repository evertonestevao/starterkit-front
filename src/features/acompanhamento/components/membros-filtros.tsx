"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectClasses } from "./campos";

/**
 * Busca, "mostrar inativos" e "por página" da lista de membros. Tudo vai para
 * a URL (?q=&inativos=1&porPagina=&page=): a página é server e busca no banco
 * só a página pedida. Mudar um filtro volta para a página 1.
 */
export function MembrosFiltros({
  opcoesPorPagina,
  padrao,
  cargos,
}: {
  opcoesPorPagina: readonly number[];
  padrao: number;
  cargos: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? "");
  // Estado local: a caixa e o seletor mudam na hora; a URL vem logo depois.
  const [inativos, setInativos] = useState(params.get("inativos") === "1");
  const [porPagina, setPorPagina] = useState(params.get("porPagina") ?? String(padrao));
  const [cargo, setCargo] = useState(params.get("cargo") ?? "");
  const [, startTransition] = useTransition();

  function aplicar(mudancas: Record<string, string | null>) {
    const qs = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) qs.set(k, v);
      else qs.delete(k);
    }
    qs.delete("page");
    startTransition(() => router.replace(`${pathname}${qs.size ? `?${qs}` : ""}`, { scroll: false }));
  }

  // Busca enquanto digita, com uma pausa curta para não ir ao banco a cada letra.
  useEffect(() => {
    if (busca === (params.get("q") ?? "")) return;
    const t = setTimeout(() => aplicar({ q: busca.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a digitação dispara
  }, [busca]);

  return (
    // Celular: busca e cargo empilhados, depois inativos + por página numa
    // linha. Computador (lg): tudo numa linha só, com a busca ocupando o resto.
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative lg:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar pelo nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-9 pl-8"
          aria-label="Buscar membro"
        />
      </div>
      <select
        aria-label="Filtrar por cargo"
        className={cn(selectClasses, "lg:w-56")}
        value={cargo}
        onChange={(e) => {
          setCargo(e.target.value);
          aplicar({ cargo: e.target.value || null });
        }}
      >
        <option value="">Todos os cargos</option>
        {cargos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-between gap-4 lg:justify-start">
        <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
          <input
            type="checkbox"
            checked={inativos}
            onChange={(e) => {
              setInativos(e.target.checked);
              aplicar({ inativos: e.target.checked ? "1" : null });
            }}
            className="size-4"
          />
          Mostrar inativos
        </label>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
          Por página
          <select
            className={cn(selectClasses, "w-20")}
            value={porPagina}
            onChange={(e) => {
              setPorPagina(e.target.value);
              aplicar({ porPagina: e.target.value });
            }}
          >
            {opcoesPorPagina.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
