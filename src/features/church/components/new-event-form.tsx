"use client";

import { Formulario } from "@/components/formulario";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { createChurchEventAction } from "@/server/actions/churchEvents";

/**
 * Publicar um evento. Cada campo diz o que acontece se ficar em branco —
 * local vazio usa o endereço da igreja, valor vazio é gratuito —, porque
 * quem cadastra não tem como adivinhar a regra.
 */
export function NewEventForm({
  igrejas,
  endereco,
}: {
  igrejas: Array<{ id: string; name: string }>;
  /** Endereço da igreja, para o texto de ajuda do campo local. */
  endereco: string | null;
}) {
  const [state, formAction, pending] = useActionState(createChurchEventAction, undefined);
  useActionToast(state);
  const unica = igrejas.length === 1 ? igrejas[0] : null;

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-5">
      {unica ? (
        <input type="hidden" name="churchId" value={unica.id} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="churchId">Igreja</Label>
          <select
            id="churchId"
            name="churchId"
            required
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="titulo">Nome do evento</Label>
        <Input id="titulo" name="titulo" required minLength={2} maxLength={120} placeholder="Ex.: Retiro de Jovens 2026" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="inicio">Começa em</Label>
          <Input id="inicio" name="inicio" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fim">
            Termina em <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input id="fim" name="fim" type="datetime-local" />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Horário de Brasília.</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="local">
          Local <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input id="local" name="local" maxLength={200} placeholder="Ex.: Chácara Recanto da Paz, Atibaia/SP" />
        <p className="text-xs text-muted-foreground">
          {endereco
            ? `Em branco, usa o endereço da igreja: ${endereco}.`
            : "Em branco, a página não mostra local."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="preco">
          Valor da inscrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input id="preco" name="preco" inputMode="decimal" maxLength={20} placeholder="Ex.: 180,00" className="sm:max-w-48" />
        <p className="text-xs text-muted-foreground">
          Em branco, o evento aparece como gratuito. O pagamento vai direto para a igreja — a
          plataforma não cobra nada.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="descricao">
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <textarea
          id="descricao"
          name="descricao"
          rows={6}
          maxLength={4000}
          placeholder="O que vai acontecer, o que está incluído, o que levar."
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="inscricoesAbertas" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Inscrições abertas
          <span className="block text-xs text-muted-foreground">
            Desmarque para divulgar o evento sem receber inscrições.
          </span>
        </span>
      </label>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Publicando..." : "Publicar evento"}
        </Button>
      </div>
    </Formulario>
  );
}
