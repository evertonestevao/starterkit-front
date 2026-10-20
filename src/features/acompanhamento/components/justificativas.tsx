"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarX, Pencil, Plus } from "lucide-react";
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
import { MOTIVOS, MOTIVO_LABEL, formatarData } from "@/lib/acompanhamento";
import { encerrarJustificativaAction, salvarJustificativaAction } from "@/server/actions/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import type { Justificativa, RolMembro } from "@/types/acompanhamento";
import { selectClasses } from "./campos";

/** Registrar ou editar uma justificativa (um culto ou um período). */
export function JustificativaForm({
  membros,
  justificativa,
  hoje,
}: {
  membros: Array<Pick<RolMembro, "id" | "nome">>;
  justificativa?: Justificativa;
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await salvarJustificativaAction(prev, formData);
      if (result.success) setAberto(false);
      return result;
    },
    undefined,
  );
  useActionToast(state);
  const id = justificativa?.id ?? "nova";

  return (
    <>
      {justificativa ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <Plus className="size-4" /> Nova justificativa
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{justificativa ? `Justificativa de ${justificativa.membroNome}` : "Nova justificativa"}</DialogTitle>
            <DialogDescription>
              Vale para todos os cultos entre as duas datas. Para um culto só, deixe a data final em branco.
            </DialogDescription>
          </DialogHeader>
          <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
            {justificativa ? (
              <>
                <input type="hidden" name="id" value={justificativa.id} />
                <input type="hidden" name="membroId" value={justificativa.membroId} />
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`jmembro-${id}`}>Membro</Label>
                <select id={`jmembro-${id}`} name="membroId" className={selectClasses} required defaultValue="">
                  <option value="" disabled>
                    Escolha a pessoa
                  </option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`jmotivo-${id}`}>Motivo</Label>
              <select id={`jmotivo-${id}`} name="motivo" className={selectClasses} defaultValue={justificativa?.motivo ?? "viagem"}>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`jtexto-${id}`}>Detalhe (opcional)</Label>
              <Input id={`jtexto-${id}`} name="motivoTexto" defaultValue={justificativa?.motivoTexto ?? ""} maxLength={300} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`jini-${id}`}>De</Label>
                <Input id={`jini-${id}`} name="dataInicio" type="date" defaultValue={justificativa?.dataInicio ?? hoje} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`jfim-${id}`}>Até</Label>
                <Input id={`jfim-${id}`} name="dataFim" type="date" defaultValue={justificativa?.dataFim ?? ""} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O motivo é dado sensível: só quem faz a chamada nesta igreja vê. A igreja superior não vê.
            </p>
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

export function JustificativasLista({
  justificativas,
  membros,
  hoje,
}: {
  justificativas: Justificativa[];
  membros: Array<Pick<RolMembro, "id" | "nome">>;
  hoje: string;
}) {
  if (justificativas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma justificativa ativa ou futura.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {justificativas.map((j) => {
        const futura = j.dataInicio > hoje;
        return (
          <li key={j.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{j.membroNome}</p>
              <p className="text-sm text-muted-foreground">
                {MOTIVO_LABEL[j.motivo]}
                {j.motivoTexto ? ` — ${j.motivoTexto}` : ""}
              </p>
              <p className="text-sm">
                {j.dataInicio === j.dataFim
                  ? formatarData(j.dataInicio)
                  : `${formatarData(j.dataInicio)} a ${formatarData(j.dataFim)}`}{" "}
                <Badge variant={futura ? "outline" : "secondary"}>{futura ? "Futura" : "Em curso"}</Badge>
              </p>
            </div>
            <div className="flex gap-2">
              <JustificativaForm membros={membros} justificativa={j} hoje={hoje} />
              <Encerrar justificativa={j} futura={futura} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Encerrar({ justificativa, futura }: { justificativa: Justificativa; futura: boolean }) {
  const [pending, start] = useTransition();
  const pergunta = futura
    ? { titulo: `Cancelar a justificativa de ${justificativa.membroNome}?`, botao: "Cancelar justificativa" }
    : {
        titulo: `Encerrar hoje a justificativa de ${justificativa.membroNome}?`,
        descricao: "A partir de hoje, faltas voltam a contar.",
        botao: "Encerrar",
      };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmar({ ...pergunta, perigo: true }))) return;
        start(async () => {
          const r = await encerrarJustificativaAction(justificativa.id);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Justificativa encerrada.");
        });
      }}
    >
      <CalendarX className="size-3.5" /> {futura ? "Cancelar" : "Encerrar"}
    </Button>
  );
}
