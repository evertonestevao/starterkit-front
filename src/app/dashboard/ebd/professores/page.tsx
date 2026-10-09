import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EbdProfessores } from "@/features/ebd/components/ebd-professores";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Professores da EBD" };

/** Professores: só a gestão da EBD (o banco confere de novo). */
export default async function EbdProfessoresPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) notFound();
  const service = await getEbdService();
  const [professores, { classes }] = await Promise.all([service.professores(actor), service.classes(actor)]);

  return (
    <EbdProfessores
      professores={professores}
      classes={classes.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome }))}
    />
  );
}
