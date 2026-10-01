"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { idadeEm, sugerirClassePorIdade } from "@/lib/ebd";
import { promoverAction } from "@/server/actions/ebd";
import type { EbdClasse, EbdPromocaoLinha } from "@/types/ebd";

const campo = "h-9 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm";

/**
 * Promoção de classe em lote. Para cada aluno, sugere a classe pela idade na
 * data da promoção (idade mínima/máxima da classe). Só vai quem está marcado
 * e com destino diferente da classe atual. O histórico da classe anterior fica.
 */
export function EbdPromocao({
  classes,
  linhas,
  dataInicial,
}: {
  classes: EbdClasse[];
  linhas: EbdPromocaoLinha[];
  dataInicial: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(dataInicial);
  const sugestoes = useMemo(
    () => Object.fromEntries(linhas.map((l) => [l.membroId, sugerirClassePorIdade(classes, l.nascimento, data)])),
    [classes, linhas, data],
  );
  // Destino escolhido; começa na sugestão (ou fica onde está).
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const destinoDe = (l: EbdPromocaoLinha) => destino[l.membroId] ?? sugestoes[l.membroId] ?? l.classeAtualId;
  const muda = (l: EbdPromocaoLinha) => destinoDe(l) !== l.classeAtualId;
  const marcado = (l: EbdPromocaoLinha) => marcados[l.membroId] ?? muda(l);
  const aplicar = linhas.filter((l) => marcado(l) && muda(l));

  const porClasse = classes
    .map((c) => ({ classe: c, alunos: linhas.filter((l) => l.classeAtualId === c.id) }))
    .filter((g) => g.alunos.length > 0);
  const semFaixa = classes.filter((c) => c.idadeMinima === null && c.idadeMaxima === null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Data da promoção (os alunos mudam a partir dela)
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        </label>
        <Button
          type="button"
          disabled={pending || aplicar.length === 0}
          onClick={() => {
            if (!window.confirm(`Mudar ${aplicar.length} aluno(s) de classe a partir de ${data.split("-").reverse().join("/")}?`)) return;
            start(async () => {
              const r = await promoverAction({
                data,
                itens: aplicar.map((l) => ({ membroId: l.membroId, classeId: destinoDe(l) })),
              });
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.success ?? "Pronto.");
                setDestino({});
                setMarcados({});
                router.refresh();
              }
            });
          }}
        >
          {pending ? "Aplicando..." : `Aplicar promoção (${aplicar.length})`}
        </Button>
      </div>
      {semFaixa.length > 0 ? (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          Sem idade definida (não entram na sugestão): {semFaixa.map((c) => c.nome).join(", ")}. Edite a classe para
          informar a idade mínima e máxima.
        </p>
      ) : null}

      {porClasse.map(({ classe, alunos }) => (
        <section key={classe.id} className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">
            {classe.nome}
            {classe.idadeMinima !== null || classe.idadeMaxima !== null ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {classe.idadeMinima ?? 0}
                {classe.idadeMaxima !== null ? ` a ${classe.idadeMaxima}` : "+"} anos
              </span>
            ) : null}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {alunos.map((l) => {
              const idade = idadeEm(l.nascimento, data);
              return (
                <li key={l.membroId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={marcado(l) && muda(l)}
                    disabled={!muda(l)}
                    onChange={(e) => setMarcados((m) => ({ ...m, [l.membroId]: e.target.checked }))}
                    aria-label={`Promover ${l.nome}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{l.nome}</span>
                    <span className="text-muted-foreground"> · {idade !== null ? `${idade} anos` : "sem nascimento"}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  <select
                    className={campo}
                    value={destinoDe(l)}
                    onChange={(e) => setDestino((d) => ({ ...d, [l.membroId]: e.target.value }))}
                    aria-label={`Classe de destino de ${l.nome}`}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id === l.classeAtualId ? `${c.nome} (fica)` : c.nome}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
