import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClasseForm } from "@/features/ebd/components/ebd-classe-acoes";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Classes da EBD" };

/**
 * Classes da EBD: criar, abrir e ver as encerradas. A gestão vê
 * todas; o professor, só as dele (o banco devolve o mesmo recorte).
 */
export default async function EbdClassesPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const { classes, gestao } = await (await getEbdService()).classes(actor);
  const ativas = classes.filter((c) => c.ativa);
  const encerradas = classes.filter((c) => !c.ativa);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {gestao
            ? "As classes da Escola Dominical, da menor para a maior idade. Abra uma para ver alunos, professores e a chamada."
            : "As classes em que você dá aula."}
        </p>
        {gestao ? <ClasseForm /> : null}
      </div>
      {ativas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {gestao ? "Nenhuma classe ainda. Crie a primeira (ex.: Adultos, Jovens, Juniores)." : "Você ainda não tem classe."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ativas.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/ebd/classes/${c.id}`}
              className="rounded-lg border p-3 transition-colors hover:bg-muted"
            >
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-muted-foreground">{[c.faixaEtaria, c.sala].filter(Boolean).join(" · ") || "—"}</p>
              <p className="mt-2 flex items-center gap-1 text-sm">
                <Users className="size-3.5 text-muted-foreground" /> {c.matriculados} aluno(s)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.professores.length > 0
                  ? `Prof.: ${c.professores.map((p) => p.nome).join(", ")}`
                  : "Sem professor definido"}
              </p>
            </Link>
          ))}
        </div>
      )}
      {gestao && encerradas.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Encerradas:{" "}
          {encerradas.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? ", " : ""}
              <Link href={`/dashboard/ebd/classes/${c.id}`} className="underline-offset-4 hover:underline">
                {c.nome}
              </Link>
            </span>
          ))}{" "}
          <Badge variant="outline">histórico</Badge>
        </p>
      ) : null}
    </section>
  );
}
