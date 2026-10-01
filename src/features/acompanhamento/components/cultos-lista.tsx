import Link from "next/link";
import { ClipboardCheck, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { descreverQuando, ultimaOcorrencia } from "@/lib/acompanhamento";
import type { Culto } from "@/types/acompanhamento";

/**
 * Cultos da Programação, do ponto de vista da chamada. Aqui só se lê: criar,
 * editar e ligar/desligar a chamada é na tela Programação.
 */
export function CultosLista({ cultos, hoje }: { cultos: Culto[]; hoje: string }) {
  const comChamada = cultos.filter((c) => c.registraChamada);
  const semChamada = cultos.filter((c) => !c.registraChamada);

  if (cultos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        A programação ainda está vazia. Cadastre os cultos em{" "}
        <Link href="/dashboard/programacao" className="font-medium text-primary underline">
          Programação
        </Link>{" "}
        — eles aparecem aqui para a chamada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {comChamada.map((c) => {
          const data = ultimaOcorrencia(c, hoje);
          return (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{c.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {descreverQuando(c)}
                  {c.tipo === "especial" ? (
                    <Badge variant="outline" className="ml-2">
                      Especial
                    </Badge>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data ? (
                  <Link
                    href={`/dashboard/acompanhamento/chamada/${c.id}?data=${data}`}
                    className={buttonVariants({ size: "lg" })}
                  >
                    <ClipboardCheck className="size-4" /> Chamada
                  </Link>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">Chamada abre no dia</span>
                )}
                <Link
                  href={`/dashboard/acompanhamento/cultos/${c.id}`}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <History className="size-4" /> Histórico
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {semChamada.length > 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Sem chamada</p>
          <p className="mt-1">{semChamada.map((c) => `${c.nome} (${descreverQuando(c)})`).join(" · ")}</p>
          <p className="mt-1 text-xs">Para marcar presença neles, ligue a opção &ldquo;Registrar chamada&rdquo; na Programação.</p>
        </div>
      ) : null}
    </div>
  );
}
