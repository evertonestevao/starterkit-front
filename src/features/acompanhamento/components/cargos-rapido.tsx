"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { definirCargosDoMembroAction } from "@/server/actions/acompanhamento";
import type { RolMembro } from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";

/**
 * Atalho da lista de membros: "+ Cargo" quando não tem, ou os cargos
 * clicáveis para trocar. Só para quem administra a igreja (o service e a
 * RLS conferem de novo).
 */
export function CargosRapido({ membro, cargos }: { membro: RolMembro; cargos: CargoResumo[] }) {
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  // Um cargo desativado que a pessoa já tem continua na lista para poder ser tirado.
  const antigos = membro.cargos.filter((c) => !cargos.some((d) => d.id === c.id));
  const opcoes = [...cargos, ...antigos];

  function abrir() {
    setMarcados(new Set(membro.cargos.map((c) => c.id)));
    setAberto(true);
  }

  function alternar(id: string) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function salvar() {
    startTransition(async () => {
      const r = await definirCargosDoMembroAction(membro.id, [...marcados]);
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.success ?? "Cargos salvos.");
        setAberto(false);
      }
    });
  }

  return (
    <>
      {membro.cargos.length === 0 ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={abrir}
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
          aria-label={`Dar cargo a ${membro.nome}`}
        >
          <Plus className="size-3" /> Cargo
        </Button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="flex flex-wrap gap-1 rounded-md text-left hover:opacity-80"
          aria-label={`Alterar os cargos de ${membro.nome}`}
          title="Alterar os cargos"
        >
          {membro.cargos.map((c) => (
            <Badge key={c.id} variant="outline" className={c.desativado ? "text-muted-foreground" : ""}>
              {c.nome}
            </Badge>
          ))}
        </button>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cargos de {membro.nome}</DialogTitle>
            <DialogDescription>
              Os cargos definem o que a pessoa acessa no sistema (Configurações → Acessos).
            </DialogDescription>
          </DialogHeader>
          {opcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cargo cadastrado. Crie em Configurações → Cargos.</p>
          ) : (
            <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
              {opcoes.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={marcados.has(c.id)}
                    onChange={() => alternar(c.id)}
                    className="size-4 accent-primary"
                  />
                  {c.nome}
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvar} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
