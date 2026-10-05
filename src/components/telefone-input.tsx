"use client";

import type { ChangeEvent, ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { mascaraTelefone } from "@/lib/telefone";

type Props = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue"> & {
  value?: string;
  defaultValue?: string | null;
  /**
   * `true` nas páginas públicas, que desenham o campo com as próprias
   * classes (tema da igreja) em vez do Input do painel.
   */
  semEstilo?: boolean;
};

/**
 * Campo de telefone com máscara "(11) 99999-9999". Todo telefone do sistema
 * usa este componente. Serve com `value`/`onChange` ou só com `defaultValue`:
 * o texto já chega formatado ao `onChange` e ao envio do formulário.
 */
export function TelefoneInput({ semEstilo = false, value, defaultValue, onChange, ...props }: Props) {
  const comuns = {
    type: "tel",
    inputMode: "tel",
    autoComplete: "tel",
    maxLength: 20,
    placeholder: "(11) 99999-9999",
    ...props,
    ...(value !== undefined ? { value: mascaraTelefone(value) } : { defaultValue: mascaraTelefone(defaultValue) }),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      e.target.value = mascaraTelefone(e.target.value);
      onChange?.(e);
    },
  } as const;

  return semEstilo ? <input {...comuns} /> : <Input {...comuns} />;
}
