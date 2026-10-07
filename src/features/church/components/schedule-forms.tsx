"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { DIAS_DA_SEMANA } from "@/lib/churchSchedule";
import { cn } from "@/lib/utils";
import {
  addScheduleItemAction,
  removeScheduleItemAction,
  updateScheduleItemAction,
} from "@/server/actions/churchSchedule";

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Adicionar à programação. "Toda semana" pede o dia; "Data específica" pede
 * a data — o formulário mostra só o campo que vale, para ninguém preencher
 * os dois e ficar em dúvida sobre qual contou.
 */
export function AddScheduleItemForm({ igrejas }: { igrejas: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(addScheduleItemAction, undefined);
  useActionToast(state);
  const [tipo, setTipo] = useState<"semanal" | "especial">("semanal");
  const form = useRef<HTMLFormElement>(null);
  const unica = igrejas.length === 1 ? igrejas[0] : null;

  // Depois de adicionar, o formulário volta limpo para o próximo item.
  useEffect(() => {
    if (state?.success) form.current?.reset();
  }, [state]);

  return (
    <form action={formAction} ref={form} className="flex flex-col gap-4">
      {unica ? (
        <input type="hidden" name="churchId" value={unica.id} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="churchId">Igreja</Label>
          <select id="churchId" name="churchId" required className={selectClasses}>
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Quando acontece</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["semanal", "Toda semana"],
              ["especial", "Data específica"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label
              key={valor}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                tipo === valor ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="sr-only"
              />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {tipo === "semanal" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="diaSemana">Dia</Label>
            <select id="diaSemana" name="diaSemana" required defaultValue="0" className={selectClasses}>
              {DIAS_DA_SEMANA.map((dia, i) => (
                <option key={dia} value={i}>
                  {dia}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="data">Data</Label>
            <Input id="data" name="data" type="date" required />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="hora">Horário</Label>
          <Input id="hora" name="hora" type="time" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="titulo">Nome</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          minLength={2}
          maxLength={80}
          placeholder={tipo === "semanal" ? "Ex.: Culto de celebração" : "Ex.: Culto de Santa Ceia"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="local">
            Local <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input id="local" name="local" maxLength={200} placeholder="Em branco: o endereço da igreja" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="descricao">
            Observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input id="descricao" name="descricao" maxLength={500} placeholder="Ex.: com espaço kids" />
        </div>
      </div>


      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="registraChamada" defaultChecked={true} className="mt-0.5 size-4" />
        <span>
          Registrar chamada neste culto
          <span className="block text-xs text-muted-foreground">
            Aparece em Chamada para marcar presença. Desmarque em ensaios e reuniões que não contam.
          </span>
        </span>
      </label>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Adicionando..." : "Adicionar à programação"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveScheduleItemButton({ itemId, titulo }: { itemId: string; titulo: string }) {
  const [state, formAction, pending] = useActionState(removeScheduleItemAction, undefined);
  useActionToast(state);
  return (
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Remover ${titulo} da programação`}
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

/**
 * Edição de um item, aberta só quando a pessoa pede (o padrão é a lista
 * enxuta). A igreja não aparece: mudar de igreja é criar lá e apagar aqui,
 * e o formulário não deve sugerir o contrário.
 */
export function EditScheduleItemForm({
  item,
}: {
  item: {
    id: string;
    titulo: string;
    tipo: "semanal" | "especial";
    dia_semana: number | null;
    data: string | null;
    hora: string;
    descricao: string | null;
    local: string | null;
    registra_chamada: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(updateScheduleItemAction, undefined);
  useActionToast(state);
  const [tipo, setTipo] = useState<"semanal" | "especial">(item.tipo);

  // Os campos abaixo são não controlados (defaultValue). Como este componente
  // é renderizado dentro de um <li key={item.id}> que não muda depois de
  // editar, um salvamento bem-sucedido troca item.titulo/hora/etc. sem
  // desmontar nada — e o Base UI acusa "changing the default value state of
  // an uncontrolled FieldControl after being initialized". Uma key no <form>
  // derivada de tudo que alimenta defaultValue força a remontagem só quando
  // algo muda de verdade (nunca durante a digitação, porque aí `item` ainda é
  // o valor antigo vindo do servidor).
  const versaoDoItem = [
    item.id,
    item.titulo,
    item.hora,
    String(item.dia_semana ?? ""),
    item.data ?? "",
    item.local ?? "",
    item.descricao ?? "",
    String(item.registra_chamada),
  ].join("\u0000");

  return (
    <form key={versaoDoItem} action={formAction} className="flex flex-col gap-3 border-t px-3 py-3">
      <input type="hidden" name="itemId" value={item.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`titulo-${item.id}`}>Nome</Label>
          <Input id={`titulo-${item.id}`} name="titulo" required defaultValue={item.titulo} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`hora-${item.id}`}>Horário</Label>
          <Input
            id={`hora-${item.id}`}
            name="hora"
            type="time"
            required
            defaultValue={item.hora.slice(0, 5)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`tipo-${item.id}`}>Quando</Label>
          <select
            id={`tipo-${item.id}`}
            name="tipo"
            className={selectClasses}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "semanal" | "especial")}
          >
            <option value="semanal">Toda semana</option>
            <option value="especial">Data específica</option>
          </select>
        </div>
        {tipo === "semanal" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`dia-${item.id}`}>Dia da semana</Label>
            <select
              id={`dia-${item.id}`}
              name="diaSemana"
              className={selectClasses}
              defaultValue={String(item.dia_semana ?? 0)}
            >
              {DIAS_DA_SEMANA.map((dia, i) => (
                <option key={dia} value={i}>
                  {dia}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`data-${item.id}`}>Data</Label>
            <Input id={`data-${item.id}`} name="data" type="date" defaultValue={item.data ?? ""} />
          </div>
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`local-${item.id}`}>Local (opcional)</Label>
          <Input id={`local-${item.id}`} name="local" defaultValue={item.local ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`descricao-${item.id}`}>Descrição (opcional)</Label>
          <Input id={`descricao-${item.id}`} name="descricao" defaultValue={item.descricao ?? ""} />
        </div>
      </div>


      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="registraChamada" defaultChecked={item.registra_chamada} className="mt-0.5 size-4" />
        <span>
          Registrar chamada neste culto
          <span className="block text-xs text-muted-foreground">
            Aparece em Chamada para marcar presença. Desmarque em ensaios e reuniões que não contam.
          </span>
        </span>
      </label>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
