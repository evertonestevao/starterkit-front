"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Quantas telas a pessoa já percorreu DENTRO do sistema nesta aba. É o que
 * diz se existe uma "tela anterior" nossa para voltar: `history.length` não
 * serve, porque conta também o site de onde a pessoa veio.
 * Zera ao recarregar a página — aí o Voltar usa o destino padrão.
 */
let telasPercorridas = 0;
let ultimaTela = "";

/** Conta as trocas de tela. Montado uma vez, no AppShell, com o caminho atual. */
export function useRastreioDeTelas(pathname: string) {
  useEffect(() => {
    // Só conta troca de verdade (em dev o React roda o efeito duas vezes).
    if (pathname === ultimaTela) return;
    ultimaTela = pathname;
    telasPercorridas += 1;
  }, [pathname]);
}

/**
 * "Voltar" das telas de detalhe (membro, classe, chamada, campanha...): toda
 * tela que mostra os detalhes de algo ou de alguém começa com este botão.
 *
 * Volta para a tela de onde a pessoa veio (lista filtrada, alerta, relatório),
 * mantendo filtro e página. `href` é o destino quando não há de onde voltar —
 * link aberto em aba nova, colado no navegador ou página recarregada.
 */
export function BotaoVoltar({ href, className }: { href: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Ctrl/Cmd+clique ou botão do meio: deixa o navegador abrir o link em outra aba.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        // A primeira contagem é a própria tela em que a pessoa entrou.
        if (telasPercorridas > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 self-start text-muted-foreground", className)}
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar
    </Link>
  );
}
