"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarConfigAction } from "@/server/actions/acompanhamento";
import type { ConfigAcompanhamento } from "@/types/acompanhamento";

/** Regras do alerta, por igreja. */
export function RegrasForm({ config }: { config: ConfigAcompanhamento }) {
  const [valores, setValores] = useState(config);
  const [pending, start] = useTransition();

  function numero(campo: keyof ConfigAcompanhamento, valor: string) {
    setValores((v) => ({ ...v, [campo]: Number(valor) }));
  }

  return (
    <form
      className="flex max-w-lg flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await salvarConfigAction(valores);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Regras salvas.");
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faltasAlerta">Avisar a partir de quantas faltas seguidas?</Label>
        <Input
          id="faltasAlerta"
          type="number"
          min={1}
          max={20}
          value={valores.faltasAlerta}
          onChange={(e) => numero("faltasAlerta", e.target.value)}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">Justificado não conta como falta e não zera a sequência. Presença zera.</p>
      </div>

      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        Contam todos os cultos com chamada feita. Para um culto não contar (ensaio, reunião), desmarque
        &ldquo;Registrar chamada&rdquo; nele, na Programação.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">&ldquo;Justificando há muito tempo&rdquo; quando passar de</span>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            aria-label="Cultos justificados seguidos"
            type="number"
            min={1}
            max={50}
            value={valores.justificativaLongaCultos}
            onChange={(e) => numero("justificativaLongaCultos", e.target.value)}
            className="w-20"
          />
          cultos seguidos ou
          <Input
            aria-label="Dias justificando"
            type="number"
            min={1}
            max={365}
            value={valores.justificativaLongaDias}
            onChange={(e) => numero("justificativaLongaDias", e.target.value)}
            className="w-20"
          />
          dias
        </div>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar regras"}
      </Button>
    </form>
  );
}
