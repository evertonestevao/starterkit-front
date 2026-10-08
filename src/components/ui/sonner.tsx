"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Quanto tempo o aviso fica na tela. A barra de baixo (globals.css) enche nesse mesmo tempo. */
export const DURACAO_DO_AVISO_MS = 5000

/**
 * Avisos (toasts) do sistema: fundo na cor do tipo e texto branco —
 * vermelho para erro, verde para sucesso, âmbar para atenção, azul para
 * informação. Fecham sozinhos em 5 segundos, com uma barra que vai enchendo
 * embaixo; com o mouse em cima, o tempo e a barra param. O "x" fecha antes.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      richColors
      duration={DURACAO_DO_AVISO_MS}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      // As mesmas cores no tema claro e no escuro (o estilo inline vence o do tema da biblioteca).
      style={
        {
          "--normal-bg": "#18181b",
          "--normal-text": "#ffffff",
          "--normal-border": "#27272a",
          "--success-bg": "#15803d",
          "--success-border": "#166534",
          "--success-text": "#ffffff",
          "--error-bg": "#b91c1c",
          "--error-border": "#991b1b",
          "--error-text": "#ffffff",
          "--warning-bg": "#b45309",
          "--warning-border": "#92400e",
          "--warning-text": "#ffffff",
          "--info-bg": "#0369a1",
          "--info-border": "#075985",
          "--info-text": "#ffffff",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast aviso-com-barra shadow-lg",
          title: "font-medium",
          closeButton: "!bg-black/30 !text-white !border-white/30 hover:!bg-black/50",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
