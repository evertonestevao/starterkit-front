"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { nomeNivel } from "@/lib/niveisRede";
import { useNomesNiveis } from "@/providers/niveis-provider";
import { cadastrarIgrejaDaRedeAction } from "@/server/actions/redeCadastro";

/**
 * Cadastrar uma igreja abaixo desta. Ela nasce ligada, com a logo desta, e
 * aguardando quem vai assumir — o convite é o passo seguinte, na lista abaixo.
 */
export function CadastrarIgrejaForm({
  maeId,
  nomeSugerido,
  podeSubsede,
}: {
  maeId: string;
  /** O nome desta igreja: as de baixo costumam usar o mesmo, com um complemento. */
  nomeSugerido: string;
  /** Só a igreja do topo cadastra subsedes. */
  podeSubsede: boolean;
}) {
  const nomes = useNomesNiveis();
  const [state, action, pending] = useActionState(cadastrarIgrejaDaRedeAction, undefined);
  useActionToast(state);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"subsede" | "congregacao">(podeSubsede ? "subsede" : "congregacao");

  if (!aberto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAberto(true)} className="self-start">
        <Plus className="size-4" /> Cadastrar igreja
      </Button>
    );
  }

  return (
    <Formulario
      // Cadastrou: volta fechado e limpo para a próxima.
      key={state?.success ?? "novo"}
      action={action}
      estado={state}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="maeId" value={maeId} />
      <input type="hidden" name="tipo" value={tipo} />
      {podeSubsede ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">O que ela é</span>
          <div className="flex flex-wrap gap-2">
            {(["subsede", "congregacao"] as const).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  tipo === t ? "border-primary bg-primary/5 font-medium" : ""
                }`}
              >
                <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} className="accent-primary" />
                {nomeNivel(nomes, t)}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nova-nome">Nome da igreja</Label>
          <Input id="nova-nome" name="nome" required minLength={2} maxLength={120} defaultValue={nomeSugerido} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nova-sobrenome">Complemento (bairro, cidade)</Label>
          <Input id="nova-sobrenome" name="sobrenome" maxLength={120} placeholder="Vila Mariana - São Paulo" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ela já nasce ligada a esta igreja e com a logo dela. Fica aguardando responsável até a pessoa convidada assumir
        — e a mensalidade dela só começa a contar a partir daí.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando..." : "Cadastrar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </Formulario>
  );
}
