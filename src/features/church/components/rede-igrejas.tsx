"use client";

import { useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import { nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import { normalizeSearch } from "@/lib/search";
import type { IgrejaDaRedePublica } from "@/types/redePublica";

/** Quantas aparecem antes do "Mostrar mais". */
const PASSO = 8;

/**
 * "Nossas igrejas" na página da sede: as igrejas da rede, com busca por nome,
 * bairro ou cidade. Cada uma leva à própria página.
 */
export function RedeIgrejas({ igrejas, nomes }: { igrejas: IgrejaDaRedePublica[]; nomes: NomesNiveis }) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(PASSO);
  const termo = normalizeSearch(busca);
  const achadas = termo
    ? igrejas.filter((i) => normalizeSearch(`${i.name} ${i.sobrenome ?? ""} ${i.address ?? ""}`).includes(termo))
    : igrejas;
  const mostradas = achadas.slice(0, limite);

  return (
    <div className="flex flex-col gap-3">
      {/* Com poucas igrejas a busca só atrapalha. */}
      {igrejas.length > PASSO ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--pg-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setLimite(PASSO);
            }}
            placeholder="Buscar por nome, bairro ou cidade"
            aria-label="Buscar igreja"
            className="h-12 w-full rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface)] pr-3 pl-10 text-base text-[var(--pg-text)] outline-none focus-visible:border-[var(--pg-accent)]"
          />
        </div>
      ) : null}

      {mostradas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--pg-border)] p-5 text-center text-sm text-[var(--pg-muted)]">
          Nenhuma igreja encontrada com “{busca}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {mostradas.map((i) => (
            <li key={i.id}>
              <a
                href={caminhoDaIgreja(i.public_code)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-4 transition-colors hover:border-[var(--pg-accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words text-[var(--pg-text)]">
                    {formatChurchName(i.name, i.sobrenome)}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium tracking-wide text-[var(--pg-accent)] uppercase">
                    {nomeNivel(nomes, i.tipo)}
                  </span>
                  {i.address ? (
                    <span className="mt-1 flex items-start gap-1.5 text-sm text-[var(--pg-muted)]">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {i.address}
                    </span>
                  ) : null}
                </span>
                <ArrowRight className="size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}

      {achadas.length > mostradas.length ? (
        <button
          type="button"
          onClick={() => setLimite((l) => l + PASSO * 2)}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--pg-border)] text-sm font-semibold text-[var(--pg-text)]"
        >
          Mostrar mais ({achadas.length - mostradas.length})
        </button>
      ) : null}
    </div>
  );
}
