"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { alterarSenhaAction } from "@/server/actions/auth";
import { CampoSenhaNova } from "./campo-senha-nova";

/**
 * Trocar a senha dentro do painel: pede a senha ATUAL. Assim, quem pegar um
 * celular com a conta aberta não troca a senha (e não tranca o dono fora).
 * Quem esqueceu a senha usa o "Esqueci minha senha", que confirma pelo e-mail.
 */
export function AlterarSenhaForm() {
  const [state, formAction, pending] = useActionState(alterarSenhaAction, undefined);
  useActionToast(state);
  const formRef = useRef<HTMLFormElement>(null);

  // Trocou: limpa os campos (senha não fica preenchida na tela).
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input id="senha-atual" name="senhaAtual" type="password" autoComplete="current-password" required />
      </div>
      {/* A chave remonta o campo depois de salvar, para a lista de requisitos zerar junto. */}
      <CampoSenhaNova key={state?.success ?? "novo"} id="senha-nova" name="novaSenha" rotulo="Nova senha" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha-confirmacao">Repita a nova senha</Label>
        <Input id="senha-confirmacao" name="confirmacao" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Trocando..." : "Trocar a senha"}
      </Button>
    </form>
  );
}
