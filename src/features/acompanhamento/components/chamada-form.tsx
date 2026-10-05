"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADO_LABEL, MOTIVOS, MOTIVO_LABEL, formatarData } from "@/lib/acompanhamento";
import { cn } from "@/lib/utils";
import type { ChamadaParaPreencher, EstadoPresenca } from "@/types/acompanhamento";
import { useChamada } from "../hooks/useChamada";
import { LegendaPresenca } from "@/components/legenda-presenca";

const ESTADOS: EstadoPresenca[] = ["presente", "ausente", "justificado"];

const COR_ATIVA: Record<EstadoPresenca, string> = {
  presente: "border-emerald-600 bg-emerald-600 text-white",
  ausente: "border-red-600 bg-red-600 text-white",
  justificado: "border-amber-500 bg-amber-500 text-white",
};

const SIGLA: Record<EstadoPresenca, string> = { presente: "P", ausente: "A", justificado: "J" };

/**
 * Chamada no celular: cada membro tem três botões grandes (P, A, J), um
 * toque marca. Busca fixa no topo, contadores e "Salvar" fixos embaixo.
 * Chamada nova começa com todos presentes — só quem faltou recebe toque.
 */
export function ChamadaForm({ chamada }: { chamada: ChamadaParaPreencher }) {
  const router = useRouter();
  const c = useChamada(chamada);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar pelo nome"
            value={c.busca}
            onChange={(e) => c.setBusca(e.target.value)}
            className="h-10 pl-8 text-base"
            aria-label="Buscar membro"
          />
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={c.todosPresentes}>
          <CheckCheck className="size-4" /> Marcar todos presentes
        </Button>
      </div>

      {chamada.membros.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ainda não há membros cadastrados. Cadastre em &ldquo;Membros&rdquo; para fazer a chamada.
        </p>
      ) : null}

      <LegendaPresenca />

      <ul className="flex flex-col divide-y rounded-lg border">
        {c.visiveis.map((m) => {
          const estado = c.estados[m.id];
          const just = c.registrada[m.id];
          return (
            <li key={m.id} className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{m.nome}</p>
                  {just ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Justificou: {MOTIVO_LABEL[just.motivo]}
                      {just.motivoTexto ? ` — ${just.motivoTexto}` : ""}
                      {just.dataInicio !== just.dataFim
                        ? ` (${formatarData(just.dataInicio)} a ${formatarData(just.dataFim)})`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={`Presença de ${m.nome}`}>
                  {ESTADOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={estado === e}
                      aria-label={ESTADO_LABEL[e]}
                      title={ESTADO_LABEL[e]}
                      onClick={() => c.marcar(m.id, e)}
                      className={cn(
                        "size-11 rounded-lg border-2 text-base font-semibold transition-colors",
                        estado === e ? COR_ATIVA[e] : "border-border text-muted-foreground",
                      )}
                    >
                      {SIGLA[e]}
                    </button>
                  ))}
                </div>
              </div>
              {estado === "justificado" && !just ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Motivo:
                  <select
                    className="h-8 rounded-md border bg-transparent px-2 text-sm text-foreground"
                    value={c.motivos[m.id] ?? "outro"}
                    onChange={(ev) => c.definirMotivo(m.id, ev.target.value as (typeof MOTIVOS)[number])}
                  >
                    {MOTIVOS.map((mo) => (
                      <option key={mo} value={mo}>
                        {MOTIVO_LABEL[mo]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </li>
          );
        })}
        {c.visiveis.length === 0 && chamada.membros.length > 0 ? (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ninguém com esse nome.</li>
        ) : null}
      </ul>

      <Visitantes
        visitantes={c.visitantes}
        onAdicionar={c.adicionarVisitante}
        onRemover={c.removerVisitante}
      />

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-3 text-sm tabular-nums" aria-live="polite">
            <span className="text-emerald-700 dark:text-emerald-400">
              <strong>{c.contadores.presente}</strong> P
            </span>
            <span className="text-red-700 dark:text-red-400">
              <strong>{c.contadores.ausente}</strong> A
            </span>
            <span className="text-amber-700 dark:text-amber-400">
              <strong>{c.contadores.justificado}</strong> J
            </span>
            {c.visitantes.length > 0 ? (
              <span className="text-muted-foreground">
                <strong>{c.visitantes.length}</strong> visit.
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            className="h-11 px-5 text-base"
            disabled={c.salvando || chamada.membros.length === 0}
            onClick={() => c.salvar(() => router.refresh())}
          >
            {c.salvando ? "Salvando..." : chamada.chamadaId ? "Salvar alterações" : "Salvar chamada"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Visitantes({
  visitantes,
  onAdicionar,
  onRemover,
}: {
  visitantes: Array<{ nome: string; telefone: string | null }>;
  onAdicionar: (v: { nome: string; telefone: string | null }) => void;
  onRemover: (indice: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  function adicionar() {
    if (nome.trim().length < 2) return;
    onAdicionar({ nome: nome.trim(), telefone: telefone.trim() || null });
    setNome("");
    setTelefone("");
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Visitantes</h3>
      {visitantes.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {visitantes.map((v, i) => (
            <li key={`${v.nome}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {v.nome}
                {v.telefone ? <span className="text-muted-foreground"> · {v.telefone}</span> : null}
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemover(i)} aria-label={`Tirar ${v.nome}`}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          placeholder="Nome do visitante"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          aria-label="Nome do visitante"
        />
        <Input
          placeholder="Telefone (opcional)"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          maxLength={20}
          aria-label="Telefone do visitante"
        />
        <Button type="button" variant="outline" onClick={adicionar} disabled={nome.trim().length < 2}>
          <UserPlus className="size-4" /> Adicionar
        </Button>
      </div>
    </section>
  );
}
