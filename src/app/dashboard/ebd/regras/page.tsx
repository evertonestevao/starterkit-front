import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EbdRegrasForm } from "@/features/ebd/components/ebd-trimestres";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Regras da EBD" };

export default async function EbdRegrasPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) notFound();
  const faltas = await (await getEbdService()).getFaltasAlerta(actor);
  return <EbdRegrasForm faltasAlerta={faltas} />;
}
