"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { saveChurchDadosAction } from "@/server/actions/churchProfile";
import type { ChurchProfile } from "@/services/churchProfileService";
import { CampoEnderecoDaIgreja } from "./campo-endereco-da-igreja";
import { SeletorDeIgreja } from "./seletor-de-igreja";

/**
 * Nome e sobrenome. O nome pode seguir o da igreja superior (o padrão do
 * ministério); o sobrenome é sempre da igreja e distingue as irmãs de mesmo
 * nome. Fica DENTRO do <form key=...>, então o estado recomeça a cada troca de
 * igreja ou salvamento.
 */
function ChurchNameFields({ igreja }: { igreja: ChurchProfile }) {
  const [herdar, setHerdar] = useState(igreja.herdarNome && igreja.hasParent);
  const [nomeProprio, setNomeProprio] = useState(igreja.nomeProprio);
  const usandoDaSuperior = herdar && igreja.parentName !== null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome da igreja</Label>
        <Input
          id="name"
          required
          minLength={2}
          maxLength={120}
          value={usandoDaSuperior ? (igreja.parentName ?? "") : nomeProprio}
          onChange={(e) => setNomeProprio(e.target.value)}
          disabled={usandoDaSuperior}
        />
        {/* Campo desabilitado não é enviado: o nome próprio segue aqui, guardado
            mesmo enquanto a igreja usa o da superior. */}
        <input type="hidden" name="name" value={nomeProprio} />
        {igreja.hasParent ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="herdarNome"
              checked={herdar}
              onChange={(e) => setHerdar(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Usar o nome de <strong>{igreja.parentName ?? "a igreja-mãe"}</strong>
              <span className="block text-xs text-muted-foreground">
                Mantém o padrão do ministério: se ela mudar o nome, o seu muda junto.
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sobrenome">Sobrenome (opcional)</Label>
        <Input
          id="sobrenome"
          name="sobrenome"
          defaultValue={igreja.sobrenome ?? ""}
          maxLength={120}
          placeholder="Prainha - Promissão"
        />
        <p className="text-xs text-muted-foreground">
          Distingue esta igreja das irmãs de mesmo nome. Aparece logo abaixo do nome na página; sem ele, nada
          aparece. É sempre só desta igreja.
        </p>
      </div>
    </>
  );
}

/**
 * Dados da igreja (Configurações → Geral): nome, sobrenome e endereço. O que
 * é só da página pública (texto, redes, logo) fica em Página da igreja.
 */
export function ChurchDataForm({ igrejas }: { igrejas: ChurchProfile[] }) {
  const [state, formAction, pending] = useActionState(saveChurchDadosAction, undefined);
  useActionToast(state);
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const igreja = igrejas.find((i) => i.id === churchId) ?? igrejas[0];

  if (!igreja) return <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>;

  // Remonta os campos ao trocar de igreja ou quando um salvamento muda algum
  // valor (ver o comentário de versaoDosCampos em ChurchProfileForm).
  const versaoDosCampos = [
    igreja.id,
    igreja.name,
    igreja.nomeProprio,
    igreja.sobrenome ?? "",
    String(igreja.herdarNome),
    igreja.parentName ?? "",
    igreja.address ?? "",
    ...Object.values(igreja.endereco).map((v) => v ?? ""),
  ].join("\u0000");

  return (
    <div className="flex flex-col gap-6">
      {igrejas.length > 1 ? <SeletorDeIgreja igrejas={igrejas} valor={churchId} aoTrocar={setChurchId} /> : null}

      <form key={versaoDosCampos} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="churchId" value={igreja.id} />
        <ChurchNameFields igreja={igreja} />
        <CampoEnderecoDaIgreja endereco={igreja.endereco} enderecoAntigo={igreja.address} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar dados"}
          </Button>
        </div>
      </form>
    </div>
  );
}
