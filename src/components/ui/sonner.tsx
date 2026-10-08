"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Avisos (toasts) do sistema: fundo escuro e texto branco em qualquer tema,
 * para chamar atenção. O tipo continua visível pela cor do ícone e da faixa
 * à esquerda — verde (sucesso), vermelho (erro), amarelo (atenção), azul
 * (informação). Fecham sozinhos em 5 segundos (o tempo para enquanto o
 * mouse está em cima) e têm o "x" para fechar antes.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      duration={5000}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-emerald-400" />,
        info: <InfoIcon className="size-5 text-sky-400" />,
        warning: <TriangleAlertIcon className="size-5 text-amber-400" />,
        error: <OctagonXIcon className="size-5 text-red-400" />,
        loading: <Loader2Icon className="size-5 animate-spin text-white" />,
      }}
      style={
        {
          "--normal-bg": "#18181b",
          "--normal-text": "#ffffff",
          "--normal-border": "#27272a",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !bg-zinc-900 !text-white !border-zinc-800 shadow-lg border-l-4 data-[type=success]:!border-l-emerald-500 data-[type=error]:!border-l-red-500 data-[type=warning]:!border-l-amber-500 data-[type=info]:!border-l-sky-500",
          title: "!text-white font-medium",
          description: "!text-zinc-300",
          closeButton: "!bg-zinc-800 !text-white !border-zinc-700 hover:!bg-zinc-700",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
