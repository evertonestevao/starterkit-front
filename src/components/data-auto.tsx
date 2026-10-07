"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de data que troca a página assim que a data é escolhida (a data
 * fica na URL, em ?<param>=YYYY-MM-DD). Substitui o par "data + botão Ver".
 */
export function DataAuto({
  valor,
  param = "data",
  rotulo,
  max,
  className,
}: {
  valor: string;
  /** Nome do parâmetro na URL. */
  param?: string;
  /** Nome acessível do campo (ex.: "Domingo"). */
  rotulo: string;
  max?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [carregando, startTransition] = useTransition();

  return (
    <input
      type="date"
      aria-label={rotulo}
      // key: se a página trocar a data por conta própria, o campo acompanha.
      key={valor}
      defaultValue={valor}
      max={max}
      disabled={carregando}
      onChange={(e) => {
        const nova = e.target.value;
        // O navegador só dispara com a data completa; vazio (campo limpo) é ignorado.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nova) || nova === valor) return;
        startTransition(() => router.push(`${pathname}?${param}=${nova}`));
      }}
      className={cn("h-9 rounded-md border bg-transparent px-2 text-sm disabled:opacity-60", className)}
    />
  );
}
