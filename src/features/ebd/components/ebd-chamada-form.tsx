"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_LABEL } from "@/lib/acompanhamento";
import { idadeEm } from "@/lib/ebd";
import { cn } from "@/lib/utils";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { EbdAulaParaPreencher } from "@/types/ebd";
import { useAulaEbd } from "../hooks/useAulaEbd";

const ESTADOS: EstadoPresenca[] = ["presente", "ausente", "justificado"];
const SIGLA: Record<EstadoPresenca, string> = { presente: "P", ausente: "A", justificado: "J" };
const COR_ATIVA: Record<EstadoPresenca, string> = {
  presente: "border-emerald-600 bg-emerald-600 text-white",
  ausente: "border-red-600 bg-red-600 text-white",
  justificado: "border-amber-500 bg-amber-500 text-white",
};

/** Chamada de uma classe da EBD no celular: P/A/J por aluno, visitantes e a contagem do dia. */
export function EbdChamadaForm({ aula }: { aula: EbdAulaParaPreencher }) {
  const router = useRouter();
  const c = useAulaEbd(aula);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar aluno"
            value={c.busca}
            onChange={(e) => c.setBusca(e.target.value)}
            className="h-10 pl-8 text-base"
            aria-label="Buscar aluno"
          />
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={c.todosPresentes}>
          <CheckCheck className="size-4" /> Marcar todos presentes
        </Button>
      </div>

      {aula.alunos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum aluno matriculado nesta classe ainda. Matricule na página da classe — ou registre como visitante abaixo.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {c.visiveis.map((a) => {
            const idade = idadeEm(a.nascimento, aula.data);
            return (
              <li key={a.membroId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{a.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {idade !== null ? `${idade} anos` : ""}
                    {!a.membroIgreja ? `${idade !== null ? " · " : ""}não membro` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={`Presença de ${a.nome}`}>
                  {ESTADOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={c.estados[a.membroId] === e}
                      aria-label={ESTADO_LABEL[e]}
                      title={ESTADO_LABEL[e]}
                      onClick={() => c.marcar(a.membroId, e)}
                      className={cn(
                        "size-11 rounded-lg border-2 text-base font-semibold transition-colors",
                        c.estados[a.membroId] === e ? COR_ATIVA[e] : "border-border text-muted-foreground",
                      )}
                    >
                      {SIGLA[e]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
          {c.visiveis.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ninguém com esse nome.</li>
          ) : null}
        </ul>
      )}

      <Visitantes c={c} />

      <section className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
        <h3 className="col-span-full text-sm font-medium">Contagem da classe</h3>
        <div className="col-span-full flex flex-col gap-1.5">
          <Label htmlFor="licao">Lição do dia (opcional)</Label>
          <Input id="licao" value={c.licao} onChange={(e) => c.setLicao(e.target.value)} maxLength={200} placeholder="Ex.: Lição 3 — A fé de Abraão" />
        </div>
        <Numero id="biblias" label="Bíblias" valor={c.biblias} onChange={c.setBiblias} />
        <Numero id="revistas" label="Revistas" valor={c.revistas} onChange={c.setRevistas} />
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="oferta">Oferta (R$)</Label>
          <Input
            id="oferta"
            inputMode="decimal"
            placeholder="0,00"
            value={c.oferta}
            onChange={(e) => c.setOferta(e.target.value)}
            className="h-10 text-base"
          />
          <span className="text-xs text-muted-foreground">Só registro — não entra no financeiro.</span>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-wrap gap-3 text-sm tabular-nums" aria-live="polite">
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
          <Button type="button" className="h-11 px-5 text-base" disabled={c.salvando} onClick={() => c.salvar(() => router.refresh())}>
            {c.salvando ? "Salvando..." : aula.aulaId ? "Salvar alterações" : "Salvar chamada"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Numero({ id, label, valor, onChange }: { id: string; label: string; valor: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={999}
        value={valor}
        onChange={(e) => onChange(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
        className="h-10 text-base"
      />
    </div>
  );
}

function Visitantes({ c }: { c: ReturnType<typeof useAulaEbd> }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  function adicionar() {
    if (nome.trim().length < 2) return;
    c.adicionarVisitante({ nome: nome.trim(), telefone: telefone.trim() || null, membroId: null });
    setNome("");
    setTelefone("");
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Visitantes</h3>
      {c.visitantes.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {c.visitantes.map((v, i) => (
            <li key={`${v.nome}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {v.nome}
                {v.telefone ? <span className="text-muted-foreground"> · {v.telefone}</span> : null}
                {v.membroId ? <span className="text-muted-foreground"> · matriculado</span> : null}
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => c.removerVisitante(i)} aria-label={`Tirar ${v.nome}`}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Nome do visitante" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} aria-label="Nome do visitante" />
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
      <p className="text-xs text-muted-foreground">Visitante que voltar pode ser matriculado na página da classe.</p>
    </section>
  );
}
