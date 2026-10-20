"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

const campo = "h-9 rounded-md border bg-transparent px-2 text-sm disabled:opacity-60";

/**
 * Filtros dos Destaques: trimestre e classe. Trocar qualquer um recarrega a
 * página na hora, mantendo o outro (os dois ficam na URL).
 */
export function EbdDestaquesFiltros({
  trimestres,
  trimestre,
  classes,
  classe,
}: {
  trimestres: Array<{ id: string; nome: string }>;
  trimestre: string;
  classes: Array<{ id: string; nome: string }>;
  /** "" = todas. */
  classe: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [carregando, startTransition] = useTransition();

  function ir(novo: { trimestre?: string; classe?: string }) {
    const qs = new URLSearchParams();
    const t = novo.trimestre ?? trimestre;
    const c = novo.classe ?? classe;
    if (t) qs.set("trimestre", t);
    if (c) qs.set("classe", c);
    startTransition(() => router.push(qs.size > 0 ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {trimestres.length > 0 ? (
        <label className="flex flex-col gap-1">
          Trimestre
          <select value={trimestre} disabled={carregando} onChange={(e) => ir({ trimestre: e.target.value })} className={campo}>
            {trimestres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        Classe
        <select value={classe} disabled={carregando} onChange={(e) => ir({ classe: e.target.value })} className={campo}>
          <option value="">Todas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
