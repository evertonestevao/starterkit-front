import { trimestreDosPedidos } from "@/lib/ebdRevistas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EbdRevistas } from "@/features/ebd/components/revistas/ebd-revistas";
import { hojeISO } from "@/lib/acompanhamento";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { getEbdRevistasActor, getEbdRevistasService, getIgrejaDosPedidos } from "@/server/ebdRevistas";
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

  const igrejaDosPedidos = await getIgrejaDosPedidos();
  if (!igrejaDosPedidos) notFound();
  const ebd = await getEbdService();
  const revistasService = await getEbdRevistasService();
  // A lista de revistas e os trimestres são da igreja de cima quando esta é
  // congregação ligada a ela (a compra é feita lá, para todas).
  const [lista, { classes }, { active }] = await Promise.all([
    revistasService.listaDaIgreja(actor, igrejaDosPedidos.id),
    ebd.classes(ebdActor),
    getActiveTenant(),
  ]);
  // Do mais recente para o mais antigo.
  const ordenados = [...lista.trimestres].sort((a, b) => b.inicio.localeCompare(a.inicio));

  if (ordenados.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Cabecalho />
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {lista.propria ? (
            <>
              Os pedidos de revista são por trimestre. Cadastre o trimestre em{" "}
              <Link href="/dashboard/ebd/trimestres" className="font-medium text-primary underline underline-offset-4">
                EBD → Trimestres
              </Link>{" "}
              e volte aqui.
            </>
          ) : (
            `As revistas desta congregação são compradas por ${lista.donaNome}. Quando a secretaria da EBD de lá cadastrar o trimestre e as revistas, os pedidos aparecem aqui.`
          )}
        </p>
      </div>
    );
  }

  // Sem escolha na URL: o próximo trimestre (é para ele que se pede revista agora).
  const escolhido = trimestreDosPedidos(ordenados, hoje, sp.trimestre) ?? ordenados[0];

  const dados = await revistasService.doTrimestre(actor, escolhido.id, igrejaDosPedidos.id).catch((err: unknown) => {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  });
  // Aba Rede: a igreja que define a lista e compra para ela e as congregações
  // (subsede e sede; congregação independente não tem rede).
  const comRede = lista.propria && (lista.temCongregacoes || igrejaDosPedidos.tipo !== "congregacao");
  const rede = comRede
    ? await revistasService.rede(actor, escolhido.id).catch((err: unknown) => {
        console.error("[revistas] falha ao carregar a rede", err);
        return null;
      })
    : null;

  return (
    <div className="flex flex-col gap-3">
      <Cabecalho />
      <EbdRevistas
        // Outro trimestre na URL remonta a tela com os filtros limpos.
        key={escolhido.id}
        trimestreId={escolhido.id}
        trimestres={ordenados.map((t) => ({ id: t.id, nome: t.nome }))}
        dados={dados}
        lista={{ propria: lista.propria, donaNome: lista.donaNome }}
        rede={rede}
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
