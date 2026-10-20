"use client";

import { useState } from "react";
import Link from "next/link";
import { Cake, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { linkWhatsapp } from "@/lib/acompanhamento";
import {
  TIPO_ANIVERSARIO_LABEL,
  descreverAnos,
  descreverQuando,
  mensagemParabens,
  type ProximoAniversario,
} from "@/lib/rolMembros";
import { cn } from "@/lib/utils";
import type { TipoAniversario } from "@/types/acompanhamento";

type Filtro = TipoAniversario | "todos";

const FILTROS: Array<[Filtro, string]> = [
  ["nascimento", "Aniversário"],
  ["casamento", "Casamento"],
  ["batismo", "Batismo"],
  ["todos", "Todos"],
];

const VAZIO: Record<Filtro, string> = {
  nascimento: "Nenhum aniversário neste mês nem no próximo.",
  casamento: "Nenhum aniversário de casamento neste mês nem no próximo.",
  batismo: "Nenhum aniversário de batismo neste mês nem no próximo.",
  todos: "Ninguém com data comemorativa neste mês nem no próximo.",
};

/** Quantos aparecem no cartão; o resto fica na tela do mês. */
const LIMITE = 6;

/**
 * Cartão do Painel com as próximas datas comemoradas. Abre em "Aniversário";
 * os botões trocam para casamento, batismo ou todos. Quem faz hoje vem em
 * destaque, com o botão de parabenizar pelo WhatsApp.
 */
export function AniversariantesCard({
  itens,
  igreja,
  saudacao,
}: {
  /** Os próximos, já em ordem de data, de todos os tipos. */
  itens: ProximoAniversario[];
  igreja: string;
  saudacao: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("nascimento");
  const doFiltro = filtro === "todos" ? itens : itens.filter((a) => a.tipo === filtro);
  const mostrados = doFiltro.slice(0, LIMITE);
  const quantos = (tipo: TipoAniversario) => itens.filter((a) => a.tipo === tipo).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="size-4 text-primary" aria-hidden /> Próximos aniversariantes
          </CardTitle>
          <Link href="/dashboard/membros/aniversariantes" className="text-sm text-primary underline underline-offset-4">
            Ver o mês inteiro
          </Link>
        </div>
        <CardDescription>Datas comemoradas pelas pessoas ativas, deste mês e do próximo.</CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Mostrar">
          {FILTROS.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-3 text-xs transition-colors",
                valor !== "todos" && "pr-1.5",
                filtro === valor
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {rotulo}
              {/* Quantos há de cada tipo (deste mês e do próximo); "Todos" não leva número. */}
              {valor !== "todos" ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.65rem] leading-none font-medium tabular-nums",
                    filtro === valor ? "bg-primary-foreground/20" : "bg-muted text-foreground",
                  )}
                >
                  {quantos(valor)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {mostrados.length === 0 ? (
          <p className="text-sm text-muted-foreground">{VAZIO[filtro]}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {mostrados.map((a) => {
                const anos = descreverAnos(a, Number(a.quando.slice(0, 4)));
                const hoje = a.emDias === 0;
                const whatsapp = hoje ? linkWhatsapp(a.whatsapp, mensagemParabens(a, igreja, saudacao)) : null;
                return (
                  <li key={`${a.membroId}-${a.tipo}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0">
                      {hoje ? (
                        <Badge>Hoje</Badge>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">{descreverQuando(a)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/dashboard/membros/${a.membroId}`} className="font-medium hover:underline">
                        {a.nome}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {TIPO_ANIVERSARIO_LABEL[a.tipo]}
                        {a.tipo === "casamento" && a.conjugeNome ? ` com ${a.conjugeNome}` : ""}
                        {anos ? ` · ${anos}` : ""}
                      </span>
                    </span>
                    {whatsapp ? (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ size: "sm" })}
                      >
                        <MessageCircle className="size-4" /> Parabenizar
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {doFiltro.length > mostrados.length ? (
              <p className="pt-2 text-xs text-muted-foreground">
                E mais {doFiltro.length - mostrados.length}. Veja todos em &quot;Ver o mês inteiro&quot;.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
