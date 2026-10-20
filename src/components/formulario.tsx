"use client";

import { startTransition, useEffect, useRef, type ComponentProps, type FormEvent } from "react";

/**
 * <form> que NÃO apaga o que foi digitado quando o servidor recusa.
 *
 * No React 19, um <form action={...}> é limpo depois de cada envio — mesmo
 * quando a action devolve erro: a pessoa erra a senha e tem que digitar o
 * e-mail de novo. Aqui o envio passa por onSubmit + startTransition, que
 * chama a mesma action (com o mesmo `pending` do useActionState) sem esse
 * reset. A validação nativa do navegador (required, min...) continua valendo.
 *
 * Com `estado`, quando a action devolve erro com `campo`, o cursor vai para
 * esse campo (o aviso aparece no toast, pelo useActionToast).
 */
export function Formulario({
  action,
  estado,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (dados: FormData) => void;
  /** Resultado da action: só `error` e `campo` importam aqui. */
  estado?: { error?: string; campo?: string };
}) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado?.error || !estado.campo || !ref.current) return;
    const campo = estado.campo;
    const el =
      ref.current.querySelector<HTMLElement>(`[name="${CSS.escape(campo)}"]:not([type="hidden"])`) ??
      ref.current.querySelector<HTMLElement>(`#${CSS.escape(campo)}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio") el.select();
  }, [estado]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // O botão clicado entra nos dados (alguns formulários têm botões com name/value).
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const dados = new FormData(e.currentTarget, submitter ?? undefined);
    startTransition(() => action(dados));
  }

  return <form ref={ref} onSubmit={enviar} {...props} />;
}
