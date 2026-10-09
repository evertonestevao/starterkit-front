"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { useActionToast } from "@/hooks/useActionToast";
import {
  CHURCH_NETWORK_NAME_MAX_LENGTH,
  CHURCH_SURNAME_MAX_LENGTH,
} from "@/lib/churchName";
import { MODULOS_DESLIGAVEIS, MODULO_INFO } from "@/lib/menuPermissoes";
import { createCompanyAction } from "@/server/actions/tenant";

export function CreateCompanyForm({
  requireTerms = false,
  next,
}: {
  requireTerms?: boolean;
  /** Para onde voltar depois de criar a igreja (só um link de vínculo; o servidor confere). */
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCompanyAction,
    undefined,
  );
  useActionToast(state);
  const [inNetwork, setInNetwork] = useState(false);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da igreja</Label>
        <Input
          id="name"
          name="name"
          placeholder="Assembleia de Deus Ministério no Ipiranga"
          minLength={2}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sobrenome">Complemento do nome (opcional)</Label>
        <Input
          id="sobrenome"
          name="sobrenome"
          placeholder="Zona Sul - São Paulo"
          maxLength={CHURCH_SURNAME_MAX_LENGTH}
          aria-describedby="sobrenome-help"
        />
        <p id="sobrenome-help" className="text-xs text-muted-foreground">
          Separa a sua igreja das de mesmo nome. Aparece junto do nome.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="faz_parte_de_rede"
            checked={inNetwork}
            onChange={(event) => setInNetwork(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>Minha igreja faz parte de uma rede de igrejas</span>
        </label>
        {inNetwork ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="rede_nome">
              Nome da rede ou ministério (opcional)
            </Label>
            <Input
              id="rede_nome"
              name="rede_nome"
              placeholder="Ministério do Belém"
              maxLength={CHURCH_NETWORK_NAME_MAX_LENGTH}
              aria-describedby="rede-help"
            />
            <p id="rede-help" className="text-xs text-muted-foreground">
              Ajuda a encontrar as outras igrejas da sua rede. Não aparece na
              página pública.
            </p>
          </div>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Quais módulos sua igreja vai usar?</legend>
        <p className="text-xs text-muted-foreground">
          Todos começam marcados. Desmarque o que sua igreja não usa — dá pra mudar depois em Configurações →
          Acessos.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODULOS_DESLIGAVEIS.map((modulo) => (
            <label key={modulo} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={`modulo_${modulo}`}
                defaultChecked
                className="mt-0.5 size-4 accent-primary"
              />
              <span>{MODULO_INFO[modulo].titulo}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Onboarding (1º acesso): aceite dos termos vigentes antes de criar.
          O required do checkbox é UX; a validação real é na server action. */}
      {requireTerms ? <TermsCheckboxes /> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar igreja"}
      </Button>
    </Formulario>
  );
}
