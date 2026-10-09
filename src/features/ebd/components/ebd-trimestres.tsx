"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { BookOpenText, Pencil, Plus, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarData } from "@/lib/acompanhamento";
import { removerTrimestreAction, salvarFaltasAlertaEbdAction, salvarTrimestreAction } from "@/server/actions/ebd";
import type { ActionState } from "@/server/actions/action-state";
import type { EbdTrimestre } from "@/types/ebd";

/** Trimestres da EBD (períodos da revista). Só a gestão chega aqui. */
export function EbdTrimestres({
  trimestres,
  atualId,
  sugestao,
}: {
  trimestres: EbdTrimestre[];
  atualId: string | null;
  /** Próximo trimestre do calendário, para preencher o formulário. */
  sugestao: { nome: string; inicio: string; fim: string };
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada trimestre é o período de uma revista. Os relatórios usam o trimestre para escolher o período.
        </p>
        <TrimestreForm sugestao={sugestao} />
      </div>
      {trimestres.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum trimestre cadastrado. Comece pelo atual: o formulário já vem preenchido.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {trimestres.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {t.nome}
                  {t.id === atualId ? <Badge>Atual</Badge> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatarData(t.inicio)} a {formatarData(t.fim)}
                  {t.revista ? ` · ${t.revista}` : ""}
                </span>
              </span>
              <span className="flex gap-2">
                <Link
                  href={`/dashboard/ebd/trimestres/${t.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                >
                  <BookOpenText className="size-3.5" /> Lições
                </Link>
                <TrimestreForm trimestre={t} sugestao={sugestao} />
                <RemoverTrimestre trimestre={t} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrimestreForm({
  trimestre,
  sugestao,
}: {
  trimestre?: EbdTrimestre;
  sugestao: { nome: string; inicio: string; fim: string };
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, fd: FormData): Promise<ActionState> => {
      const r = await salvarTrimestreAction(prev, fd);
      if (r.success) setAberto(false);
      return r;
    },
    undefined,
  );
  useActionToast(state);
  const v = trimestre ?? { ...sugestao, revista: null };
  const id = trimestre?.id ?? "novo";

  return (
    <>
      {trimestre ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <Plus className="size-4" /> Novo trimestre
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{trimestre ? `Editar ${trimestre.nome}` : "Novo trimestre"}</DialogTitle>
            <DialogDescription>Datas e a revista usada no período.</DialogDescription>
          </DialogHeader>
          <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
            {trimestre ? <input type="hidden" name="id" value={trimestre.id} /> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tr-nome-${id}`}>Nome</Label>
              <Input id={`tr-nome-${id}`} name="nome" required maxLength={60} defaultValue={v.nome} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`tr-ini-${id}`}>Início</Label>
                <Input id={`tr-ini-${id}`} name="inicio" type="date" required defaultValue={v.inicio} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`tr-fim-${id}`}>Fim</Label>
                <Input id={`tr-fim-${id}`} name="fim" type="date" required defaultValue={v.fim} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tr-rev-${id}`}>Revista (opcional)</Label>
              <Input id={`tr-rev-${id}`} name="revista" maxLength={120} defaultValue={v.revista ?? ""} placeholder="Ex.: Lições Bíblicas — Adultos" />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </Formulario>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RemoverTrimestre({ trimestre }: { trimestre: EbdTrimestre }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Remover ${trimestre.nome}`}
      onClick={async () => {
        const sim = await confirmar({
          titulo: `Remover ${trimestre.nome}?`,
          descricao: "As aulas e presenças não são apagadas.",
          botao: "Remover",
          perigo: true,
        });
        if (!sim) return;
        start(async () => {
          const r = await removerTrimestreAction(trimestre.id);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Removido.");
        });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

/** Regra do alerta da EBD: quantas faltas seguidas. */
export function EbdRegrasForm({ faltasAlerta }: { faltasAlerta: number }) {
  const [valor, setValor] = useState(faltasAlerta);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await salvarFaltasAlertaEbdAction(valor);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Salvo.");
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faltas-ebd">Avisar a partir de quantas faltas seguidas na EBD?</Label>
        <Input
          id="faltas-ebd"
          type="number"
          min={1}
          max={20}
          value={valor}
          onChange={(e) => setValor(Number(e.target.value))}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          Conta só a classe em que o aluno está matriculado. Justificado não soma nem zera; presença zera. Independente da
          regra dos cultos.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
