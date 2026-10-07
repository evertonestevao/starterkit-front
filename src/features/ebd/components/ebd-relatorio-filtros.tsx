"use client";

import { useState } from "react";

const campo = "h-9 rounded-md border bg-transparent px-2 text-sm";

/**
 * Filtros dos relatórios da EBD (formulário GET: o período fica na URL).
 * Escolher um trimestre preenche "De" e "Até" com o início e o fim dele; as
 * datas continuam editáveis, e mexer nelas volta o seletor para "Período
 * livre". Quem manda no relatório são sempre as duas datas.
 */
export function EbdRelatorioFiltros({
  trimestres,
  classes,
  de: deInicial,
  ate: ateInicial,
  classe,
}: {
  trimestres: Array<{ id: string; nome: string; inicio: string; fim: string }>;
  classes: Array<{ id: string; nome: string }>;
  de: string;
  ate: string;
  classe: string;
}) {
  const [de, setDe] = useState(deInicial);
  const [ate, setAte] = useState(ateInicial);
  // O trimestre selecionado é o que casa exatamente com as datas.
  const trimestre = trimestres.find((t) => t.inicio === de && t.fim === ate)?.id ?? "";

  function escolherTrimestre(id: string) {
    const t = trimestres.find((x) => x.id === id);
    if (!t) return;
    setDe(t.inicio);
    setAte(t.fim);
  }

  return (
    <form className="flex flex-wrap items-end gap-2 text-sm">
      {trimestres.length > 0 ? (
        <label className="flex flex-col gap-1">
          Trimestre
          {/* Sem name: o que vai na URL são as datas. */}
          <select value={trimestre} onChange={(e) => escolherTrimestre(e.target.value)} className={campo}>
            <option value="">Período livre</option>
            {trimestres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        De
        <input name="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} required className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        Até
        <input name="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} required className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        Classe
        <select name="classe" defaultValue={classe} className={campo}>
          <option value="">Todas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
        Ver
      </button>
    </form>
  );
}
