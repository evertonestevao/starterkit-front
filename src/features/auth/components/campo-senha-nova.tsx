"use client";

import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REQUISITOS_DA_SENHA, SENHA_MAX } from "@/lib/senha";
import { cn } from "@/lib/utils";

/**
 * Campo de senha NOVA (cadastro, nova senha, troca de senha) com a lista do
 * que a senha precisa ter, marcando cada item conforme a pessoa digita. O
 * servidor confere de novo; isto é só para ninguém descobrir a regra errando.
 */
export function CampoSenhaNova({
  id = "password",
  name = "password",
  rotulo = "Senha",
}: {
  id?: string;
  name?: string;
  rotulo?: string;
}) {
  const [senha, setSenha] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete="new-password"
        maxLength={SENHA_MAX}
        required
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        aria-describedby={`${id}-requisitos`}
      />
      <ul id={`${id}-requisitos`} className="grid gap-1 text-xs sm:grid-cols-2" aria-label="Requisitos">
        {REQUISITOS_DA_SENHA.map((r) => {
          const ok = r.atende(senha);
          return (
            <li
              key={r.chave}
              className={cn(
                "flex items-center gap-1.5",
                ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              <span>
                {r.texto}
                <span className="sr-only">{ok ? " (feito)" : " (falta)"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
