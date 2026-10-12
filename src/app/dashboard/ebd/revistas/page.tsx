import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EbdRevistas } from "@/features/ebd/components/revistas/ebd-revistas";
import { hojeISO } from "@/lib/acompanhamento";
import { trimestreDe } from "@/lib/ebd";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { getEbdRevistasActor, getEbdRevistasService } from "@/server/ebdRevistas";
import { nomeCompletoDaIgreja } from "@/server/nomeDaIgreja";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Revistas da EBD" };

/**
 * Pedidos de revista por trimestre: só a gestão da EBD (o professor recebe
 * 404 mesmo com a URL na mão; o service e o banco recusam de novo).
 */
export default async function EbdRevistasPage({ searchParams }: { searchParams: Promise<{ trimestre?: string }> }) {
  const actor = await getEbdRevistasActor();
  const ebdActor = await getEbdActorAutorizado();
  if (!actor || !ebdActor) notFound();
  const sp = await searchParams;
  const hoje = hojeISO();

  const ebd = await getEbdService();
  const [trimestres, { classes }, { active }] = await Promise.all([
    ebd.trimestres(ebdActor),
    ebd.classes(ebdActor),
    getActiveTenant(),
  ]);
  // Do mais recente para o mais antigo.
  const ordenados = [...trimestres].sort((a, b) => b.inicio.localeCompare(a.inicio));

  if (ordenados.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Cabecalho />
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Os pedidos de revista são por trimestre. Cadastre o trimestre em{" "}
          <Link href="/dashboard/ebd/trimestres" className="font-medium text-primary underline underline-offset-4">
            EBD → Trimestres
          </Link>{" "}
          e volte aqui.
        </p>
      </div>
    );
  }

  // Sem escolha na URL: o próximo trimestre (é para ele que se pede revista
  // agora); se não houver, o de hoje; senão, o mais recente.
  const proximo = [...ordenados].reverse().find((t) => t.inicio > hoje);
  const escolhido =
    ordenados.find((t) => t.id === sp.trimestre) ?? proximo ?? trimestreDe(ordenados, hoje) ?? ordenados[0];

  const dados = await (await getEbdRevistasService()).doTrimestre(actor, escolhido.id).catch((err: unknown) => {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  });

  return (
    <div className="flex flex-col gap-3">
      <Cabecalho />
      <EbdRevistas
        // Outro trimestre na URL remonta a tela com os filtros limpos.
        key={escolhido.id}
        trimestreId={escolhido.id}
        trimestres={ordenados.map((t) => ({ id: t.id, nome: t.nome }))}
        dados={dados}
        classes={classes.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome }))}
        igreja={active ? await nomeCompletoDaIgreja(active.id, active.name) : ""}
        hoje={hoje}
      />
    </div>
  );
}

function Cabecalho() {
  return (
    <div className="print:hidden">
      <h3 className="text-lg font-semibold">Revistas</h3>
      <p className="text-sm text-muted-foreground">
        O que cada pessoa pediu no trimestre, quanto já pagou e se já recebeu. Esse dinheiro é o caixa das revistas: não
        entra na Tesouraria nem na oferta da EBD.
      </p>
    </div>
  );
}
