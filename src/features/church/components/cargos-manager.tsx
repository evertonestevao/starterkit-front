"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Pencil, Plus, Power } from "lucide-react";
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
import { podeEditarCargo } from "@/lib/cargos";
import { definirCargoAtivoAction, salvarCargoAction } from "@/server/actions/cargos";
import type { ActionState } from "@/server/actions/action-state";
import type { Cargo } from "@/types/cargos";

/**
 * Catálogo de cargos da igreja: os padrões, os herdados das igrejas de cima
 * (só uso) e os próprios (criar, editar, desativar).
 */
export function CargosManager({ cargos, podeGerenciar }: { cargos: Cargo[]; podeGerenciar: boolean }) {
  const padrao = cargos.filter((c) => c.origem === "plataforma" && !c.desativado);
  const herdados = cargos.filter((c) => c.origem === "herdado" && !c.desativado);
  const proprios = cargos.filter((c) => c.origem === "proprio");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-medium">Cargos desta igreja</h3>
            <p className="text-sm text-muted-foreground">
              Criados aqui. As igrejas abaixo desta (subsedes e congregações) também podem usar.
            </p>
          </div>
          {podeGerenciar ? <CargoForm /> : null}
        </div>
        {proprios.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum cargo próprio ainda. Use os padrões abaixo ou crie um (ex.: Coordenador de células).
          </p>
        ) : (
          <ListaCargos cargos={proprios} podeGerenciar={podeGerenciar} />
        )}
      </section>

      {herdados.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div>
            <h3 className="font-medium">Herdados</h3>
            <p className="text-sm text-muted-foreground">Criados pelas igrejas acima desta. Pode usar, mas só quem criou edita.</p>
          </div>
          <ListaCargos cargos={herdados} podeGerenciar={false} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div>
          <h3 className="font-medium">Padrões</h3>
          <p className="text-sm text-muted-foreground">Disponíveis para todas as igrejas. Não podem ser editados.</p>
        </div>
        <ListaCargos cargos={padrao} podeGerenciar={false} />
      </section>
    </div>
  );
}

function ListaCargos({ cargos, podeGerenciar }: { cargos: Cargo[]; podeGerenciar: boolean }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {cargos.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${c.desativado ? "text-muted-foreground line-through" : ""}`}>
              {c.nome}
              {c.unico ? (
                <Badge variant="outline" className="ml-2">
                  Uma pessoa por igreja
                </Badge>
              ) : null}
              {c.desativado ? (
                <Badge variant="outline" className="ml-2">
                  Desativado
                </Badge>
              ) : null}
            </p>
            {c.descricao ? <p className="text-xs text-muted-foreground">{c.descricao}</p> : null}
            {c.origem === "herdado" && c.donoNome ? (
              <p className="text-xs text-muted-foreground">Criado por {c.donoNome}</p>
            ) : null}
          </div>
          {podeGerenciar && podeEditarCargo(c) ? (
            <div className="flex gap-2">
              <CargoForm cargo={c} />
              <AtivarCargo cargo={c} />
            </div>
          ) : (
            <Lock className="size-4 text-muted-foreground" aria-label="Só leitura" />
          )}
        </li>
      ))}
    </ul>
  );
}

function AtivarCargo({ cargo }: { cargo: Cargo }) {
  const [pending, start] = useTransition();
  const ativar = cargo.desativado;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !ativar &&
          !window.confirm(
            `Desativar "${cargo.nome}"? Ninguém mais recebe este cargo, nem aqui nem nas igrejas abaixo. Quem já tem continua com ele.`,
          )
        )
          return;
        start(async () => {
          const r = await definirCargoAtivoAction(cargo.id, ativar);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Pronto.");
        });
      }}
    >
      <Power className="size-3.5" /> {ativar ? "Reativar" : "Desativar"}
    </Button>
  );
}

function CargoForm({ cargo }: { cargo?: Cargo }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await salvarCargoAction(prev, formData);
      if (result.success) setAberto(false);
      return result;
    },
    undefined,
  );
  useActionToast(state);
  const id = cargo?.id ?? "novo";

  return (
    <>
      {cargo ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <Plus className="size-4" /> Novo cargo
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{cargo ? `Editar ${cargo.nome}` : "Novo cargo"}</DialogTitle>
            <DialogDescription>
              O cargo identifica a pessoa (ex.: Diácono). Não dá acesso ao sistema.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            {cargo ? <input type="hidden" name="id" value={cargo.id} /> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cargo-nome-${id}`}>Nome</Label>
              <Input
                id={`cargo-nome-${id}`}
                name="nome"
                required
                minLength={2}
                maxLength={60}
                defaultValue={cargo?.nome}
                placeholder="Ex.: Coordenador de células"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cargo-desc-${id}`}>Descrição (opcional)</Label>
              <Input id={`cargo-desc-${id}`} name="descricao" maxLength={200} defaultValue={cargo?.descricao ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cargo-ordem-${id}`}>Ordem na lista</Label>
              <Input
                id={`cargo-ordem-${id}`}
                name="ordem"
                type="number"
                min={0}
                max={999}
                defaultValue={cargo?.ordem ?? 100}
                className="w-28"
              />
              <span className="text-xs text-muted-foreground">Menor aparece primeiro. Os padrões vão de 1 a 13.</span>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="unico" defaultChecked={cargo?.unico ?? false} className="mt-0.5 size-4" />
              <span>
                Uma pessoa por igreja
                <span className="block text-xs text-muted-foreground">Como o Pastor: cada igreja tem no máximo um.</span>
              </span>
            </label>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
