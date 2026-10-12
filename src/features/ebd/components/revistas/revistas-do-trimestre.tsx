"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarReais } from "@/lib/ebd";
import { cn } from "@/lib/utils";
import { copiarRevistasAction, removerRevistaAction, salvarRevistaAction } from "@/server/actions/ebdRevistas";
import type { EbdRevista } from "@/types/ebdRevistas";

const emReais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/**
 * As revistas do trimestre: título, preço e a classe que costuma usar (serve
 * para sugerir no pedido). Dá para trazer a lista de outro trimestre e só
 * acertar os preços.
 */
export function RevistasDoTrimestre({
  trimestreId,
  revistas,
  classes,
  outrosTrimestres,
}: {
  trimestreId: string;
  revistas: EbdRevista[];
  classes: Array<{ id: string; nome: string }>;
  outrosTrimestres: Array<{ id: string; nome: string }>;
}) {
  const [editando, setEditando] = useState<EbdRevista | "nova" | null>(null);
  const [copiarDe, setCopiarDe] = useState("");
  const [pending, startTransition] = useTransition();

  function rodar(acao: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          O preço fica gravado em cada pedido: mudar aqui não altera os pedidos já feitos.
        </p>
        <Button type="button" size="sm" onClick={() => setEditando("nova")}>
          <Plus className="size-4" /> Nova revista
        </Button>
      </div>

      {revistas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma revista neste trimestre ainda. Cadastre as revistas (título e preço) para começar os pedidos.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {revistas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.titulo}</span>
                <span className="text-xs text-muted-foreground">
                  {formatarReais(r.precoCentavos)}
                  {r.classeNome ? ` · sugerida para ${r.classeNome}` : ""}
                </span>
              </span>
              <span className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditando(r)}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Remover ${r.titulo}`}
                  onClick={async () => {
                    const sim = await confirmar({
                      titulo: `Remover "${r.titulo}" deste trimestre?`,
                      descricao: "Só sai da lista se ninguém tiver pedido esta revista.",
                      botao: "Remover",
                      perigo: true,
                    });
                    if (sim) rodar(() => removerRevistaAction(r.id));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {outrosTrimestres.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Trazer as revistas de outro trimestre</span>
            <select
              className={cn(selectClasses, "min-w-56")}
              value={copiarDe}
              onChange={(e) => setCopiarDe(e.target.value)}
              aria-label="Trimestre de onde copiar"
            >
              <option value="">Escolha o trimestre</option>
              {outrosTrimestres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !copiarDe}
            onClick={() => rodar(() => copiarRevistasAction(copiarDe, trimestreId))}
          >
            <Copy className="size-4" /> Copiar
          </Button>
        </div>
      ) : null}

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando === "nova" ? "Nova revista" : "Editar revista"}</DialogTitle>
            <DialogDescription>Ex.: “Adultos – aluno”, “Juniores – professor”.</DialogDescription>
          </DialogHeader>
          {editando !== null ? (
            <RevistaForm
              trimestreId={trimestreId}
              revista={editando === "nova" ? undefined : editando}
              classes={classes}
              onFechar={() => setEditando(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevistaForm({
  trimestreId,
  revista,
  classes,
  onFechar,
}: {
  trimestreId: string;
  revista?: EbdRevista;
  classes: Array<{ id: string; nome: string }>;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvarRevistaAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={revista?.id ?? ""} />
      <input type="hidden" name="trimestreId" value={trimestreId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revista-titulo">Título</Label>
        <Input
          id="revista-titulo"
          name="titulo"
          required
          minLength={2}
          maxLength={80}
          defaultValue={revista?.titulo ?? ""}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revista-preco">Preço (R$)</Label>
          <Input
            id="revista-preco"
            name="preco"
            inputMode="decimal"
            required
            placeholder="12,50"
            defaultValue={revista ? emReais(revista.precoCentavos) : ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revista-classe">Sugerir para a classe</Label>
          <select id="revista-classe" name="classeId" className={selectClasses} defaultValue={revista?.classeId ?? ""}>
            <option value="">Nenhuma</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </Formulario>
  );
}
