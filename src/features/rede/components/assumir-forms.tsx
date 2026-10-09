"use client";

import { useActionState } from "react";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenhaNova } from "@/features/auth/components/campo-senha-nova";
import { useActionToast } from "@/hooks/useActionToast";
import { assumirIgrejaAction, criarContaEAssumirAction } from "@/server/actions/redeCadastro";

/** Já logado com o e-mail do convite: um botão. */
export function AssumirForm({ token, igreja }: { token: string; igreja: string }) {
  const [state, action, pending] = useActionState(assumirIgrejaAction, undefined);
  useActionToast(state);
  return (
    <Formulario action={action} estado={state}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Assumindo..." : `Assumir ${igreja}`}
      </Button>
    </Formulario>
  );
}

/**
 * Primeiro acesso: só o nome e uma senha. O e-mail é o do convite (aparece
 * para a pessoa conferir) — é por ele que ela recupera a senha depois.
 */
export function CriarSenhaEAssumirForm({ token, email, nome }: { token: string; email: string; nome: string }) {
  const [state, action, pending] = useActionState(criarContaEAssumirAction, undefined);
  useActionToast(state);
  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
        <span className="text-xs text-muted-foreground">Sua conta vai ficar neste e-mail</span>
        <span className="font-medium break-all">{email}</span>
        <span className="text-xs text-muted-foreground">
          Se não for o seu, não continue: peça a quem cadastrou a igreja que corrija o convite.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nome">Seu nome</Label>
        <Input id="nome" name="nome" required minLength={2} maxLength={120} defaultValue={nome} autoComplete="name" />
      </div>
      <CampoSenhaNova id="senha" name="senha" rotulo="Crie uma senha" />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar senha e assumir"}
      </Button>
    </Formulario>
  );
}
