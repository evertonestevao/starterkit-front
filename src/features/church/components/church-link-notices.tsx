"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Network, X } from "lucide-react";
import { nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import { useNomesNiveis } from "@/providers/niveis-provider";
import { Button } from "@/components/ui/button";
import { dismissChurchLinkNoticeAction } from "@/server/actions/churchLinks";
import type { ChurchLinkNotice, ChurchLinkNoticeKind } from "@/types/churchLinks";

const TITULO: Record<ChurchLinkNoticeKind, (notice: ChurchLinkNotice) => string> = {
  pedido: (n) => `${n.outraIgrejaNome} pediu para entrar na sua rede.`,
  aprovado: (n) => `${n.outraIgrejaNome} aprovou o vínculo da sua igreja.`,
  recusado: (n) => `${n.outraIgrejaNome} não aprovou o seu pedido de vínculo.`,
  movida: (n) => `${n.outraIgrejaNome} mudou a função da sua igreja na rede.`,
  encerrado: (n) => `${n.outraIgrejaNome} desfez o vínculo com a sua igreja.`,
};

/** Segunda linha: o que a pessoa precisa saber além do título. */
function detalheDe(notice: ChurchLinkNotice, nomes: NomesNiveis): string | null {
  if (notice.kind === "recusado" && notice.detalhe) return `Motivo: ${notice.detalhe}`;
  if (notice.kind === "movida" && notice.detalhe) return `${notice.detalhe} de ${notice.outraIgrejaNome}.`;
  if (notice.kind === "aprovado" && notice.detalhe) {
    const funcao = nomeNivel(nomes, notice.detalhe === "subsede" ? "subsede" : "congregacao", { minusculo: true });
    return `Agora é ${funcao} de ${notice.outraIgrejaNome}.`;
  }
  return null;
}

function Notice({ notice }: { notice: ChurchLinkNotice }) {
  const [, formAction, pending] = useActionState(dismissChurchLinkNoticeAction, undefined);
  const detalhe = detalheDe(notice, useNomesNiveis());
  return (
    <li className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <Network className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{TITULO[notice.kind](notice)}</p>
        {detalhe ? <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p> : null}
        <Link
          href={notice.kind === "pedido" ? "/dashboard/settings/vinculos#pedidos" : "/dashboard/settings/vinculos"}
          className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {notice.kind === "pedido" ? "Ver o pedido" : "Ver vínculos"}
        </Link>
      </div>
      <form action={formAction}>
        <input type="hidden" name="noticeId" value={notice.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label="Dispensar aviso" className="gap-1">
          <X className="size-3.5" aria-hidden />
          Entendi
        </Button>
      </form>
    </li>
  );
}

/**
 * Pedidos de vínculo recebidos, respostas aos que a igreja fez, mudanças de
 * posição e vínculos desfeitos pela outra igreja, no início do painel. Ficam
 * até a pessoa dizer "entendi": um aviso que some sozinho é um aviso que o
 * pastor não viu.
 */
export function ChurchLinkNotices({ notices }: { notices: ChurchLinkNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Avisos sobre vínculos entre igrejas">
      {notices.map((notice) => (
        <Notice key={notice.id} notice={notice} />
      ))}
    </ul>
  );
}
