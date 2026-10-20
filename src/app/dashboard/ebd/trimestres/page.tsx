import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EbdTrimestres } from "@/features/ebd/components/ebd-trimestres";
import { hojeISO } from "@/lib/acompanhamento";
import { proximoTrimestre, trimestreDe } from "@/lib/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Trimestres da EBD" };

export default async function EbdTrimestresPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) notFound();
  const trimestres = await (await getEbdService()).trimestres(actor);
  const hoje = hojeISO();
  return (
    <EbdTrimestres
      trimestres={trimestres}
      atualId={trimestreDe(trimestres, hoje)?.id ?? null}
      sugestao={proximoTrimestre(trimestres, hoje)}
    />
  );
}
