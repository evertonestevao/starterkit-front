"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROTA_MINHA_CONTA } from "@/lib/menuPermissoes";
import type { AvisoMensalidade as Aviso, BloqueioMensalidade as Bloqueio } from "@/lib/mensalidadeAviso";

const DESTINO = "/dashboard/mensalidade";

/**
 * Aviso de mensalidade pendente, no topo de todas as telas do painel. Só
 * chega aqui para quem administra a igreja (quem decide é o servidor). É um
 * lembrete: não trava nada e não some sozinho enquanto a pendência existir.
 */
export function AvisoMensalidade({ aviso }: { aviso: Aviso }) {
  const naMensalidade = usePathname() === DESTINO;

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-start print:hidden"
    >
      <Info className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{aviso.titulo}</p>
        <p className="mt-0.5 text-muted-foreground">{aviso.texto}</p>
      </div>
      {/* Na própria tela da mensalidade o botão não leva a lugar nenhum. */}
      {!naMensalidade ? (
        <Link href={DESTINO} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 self-start")}>
          {aviso.acao}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Painel suspenso por mensalidade pendente. No lugar de qualquer tela aparece
 * a explicação; continuam abertas só a mensalidade (para pagar e reativar) e
 * a conta da própria pessoa. As telas em si já respondem 404 no servidor — o
 * que este componente faz é dizer o porquê, em vez de um "não encontrado".
 */
export function PainelSuspenso({ bloqueio, children }: { bloqueio: Bloqueio; children: React.ReactNode }) {
  const pathname = usePathname();
  const telaLivre = pathname === DESTINO || pathname === ROTA_MINHA_CONTA;

  if (telaLivre) {
    return (
      <>
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm print:hidden"
        >
          <Lock className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{bloqueio.titulo}</p>
            <p className="mt-0.5 text-muted-foreground">{bloqueio.texto}</p>
          </div>
        </div>
        {children}
      </>
    );
  }

  return (
    <div
      role="status"
      className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-4 rounded-lg border p-8 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <Lock className="size-6 text-destructive" aria-hidden />
      </span>
      <h2 className="text-xl font-semibold tracking-tight">{bloqueio.titulo}</h2>
      <p className="text-sm text-muted-foreground">{bloqueio.texto}</p>
      {bloqueio.acao ? (
        <Link href={DESTINO} className={buttonVariants()}>
          {bloqueio.acao}
        </Link>
      ) : null}
    </div>
  );
}
