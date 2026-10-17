"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Network } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UnidadeParaTrocar {
  churchId: string;
  churchName: string;
  tipo: string;
  parentId: string | null;
}

const TIPO_LABEL: Record<string, string> = { sede: "Sede", subsede: "Subsede", congregacao: "Congregação" };

/**
 * Troca "qual igreja estou vendo" em Membros: a própria, ou uma unidade
 * vinculada na rede (migration 20261022100000 — cadastro de quem é membro de
 * fato e assinou o termo). Em qualquer unidade (inclusive a própria), dá
 * para pedir "+ rede": mistura ela com as unidades vinculadas a ela, não só
 * a partir da própria igreja. Busca por digitação, lista curta (rede
 * pequena), sem dependência nova.
 */
export function MembrosRedeSwitcher({
  unidades,
  unidadeAtivaId,
  unidadeAtivaNome,
  arvoreAtiva,
}: {
  unidades: UnidadeParaTrocar[];
  unidadeAtivaId: string | null;
  unidadeAtivaNome: string | null;
  arvoreAtiva: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return unidades;
    return unidades.filter((u) => u.churchName.toLowerCase().includes(termo));
  }, [unidades, busca]);

  const temFilhos = (churchId: string) => unidades.some((u) => u.parentId === churchId);

  function irPara(churchId: string | null, arvore: boolean) {
    setAberto(false);
    setBusca("");
    const qs = new URLSearchParams();
    if (churchId) qs.set("unidade", churchId);
    if (arvore) qs.set("arvore", "1");
    router.push(qs.size ? `${pathname}?${qs}` : pathname);
  }

  if (unidades.length === 0) return null;

  const rotulo = arvoreAtiva
    ? `${unidadeAtivaId ? unidadeAtivaNome : "Minha igreja"} + rede`
    : unidadeAtivaId
      ? `Vendo: ${unidadeAtivaNome}`
      : "Minha igreja";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
        aria-expanded={aberto}
      >
        <Network className="size-4 text-muted-foreground" />
        {rotulo}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {aberto ? (
        <div className="absolute z-10 mt-1 w-80 rounded-lg border bg-popover p-2 shadow-md">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar igreja da rede..."
            aria-label="Buscar igreja da rede"
            className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <ul className="max-h-72 overflow-y-auto">
            <li className="flex items-stretch gap-1">
              <button
                type="button"
                onClick={() => irPara(null, false)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  !unidadeAtivaId && !arvoreAtiva && "bg-muted font-medium",
                )}
              >
                Minha igreja
              </button>
              <button
                type="button"
                onClick={() => irPara(null, true)}
                title="Minha igreja + as unidades vinculadas a ela"
                className={cn(
                  "shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                  !unidadeAtivaId && arvoreAtiva && "bg-muted font-medium text-foreground",
                )}
              >
                + rede
              </button>
            </li>
            <li className="my-1 border-t" />
            {filtradas.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma igreja encontrada.</li>
            ) : (
              filtradas.map((u) => (
                <li key={u.churchId} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => irPara(u.churchId, false)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      u.churchId === unidadeAtivaId && !arvoreAtiva && "bg-muted font-medium",
                    )}
                  >
                    {u.churchName} <span className="text-xs text-muted-foreground">{TIPO_LABEL[u.tipo] ?? u.tipo}</span>
                  </button>
                  {temFilhos(u.churchId) ? (
                    <button
                      type="button"
                      onClick={() => irPara(u.churchId, true)}
                      title={`${u.churchName} + as unidades vinculadas a ela`}
                      className={cn(
                        "shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                        u.churchId === unidadeAtivaId && arvoreAtiva && "bg-muted font-medium text-foreground",
                      )}
                    >
                      + rede
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
