"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ChevronDown } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { idadeEm, sugerirClassePorIdade } from "@/lib/ebd";
import { promoverAction } from "@/server/actions/ebd";
import type { EbdClasse, EbdPromocaoLinha } from "@/types/ebd";

const campo =
  "h-9 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm";

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
    () =>
      Object.fromEntries(
        linhas.map((l) => [
          l.membroId,
          sugerirClassePorIdade(classes, l.nascimento, data),
        ]),
      ),
    [classes, linhas, data],
  );
  // Destino escolhido; começa na sugestão (ou continua onde está).
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  // Classe aberta ou fechada; quem ainda não foi tocada segue o padrão abaixo.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  const destinoDe = (l: EbdPromocaoLinha) =>
    destino[l.membroId] ?? sugestoes[l.membroId] ?? l.classeAtualId;
  const muda = (l: EbdPromocaoLinha) => destinoDe(l) !== l.classeAtualId;
  const marcado = (l: EbdPromocaoLinha) => marcados[l.membroId] ?? muda(l);
  const aplicar = linhas.filter((l) => marcado(l) && muda(l));

  const porClasse = classes
    .map((c) => ({
      classe: c,
      alunos: linhas.filter((l) => l.classeAtualId === c.id),
    }))
    .filter((g) => g.alunos.length > 0)
    .map((g) => ({
      ...g,
      mudam: g.alunos.filter((l) => marcado(l) && muda(l)).length,
    }));
  // Padrão: abre só a classe em que a sugestão pela idade muda alguém.
  const aberta = (classeId: string, alunos: EbdPromocaoLinha[]) =>
    abertas[classeId] ??
    alunos.some(
      (l) => (sugestoes[l.membroId] ?? l.classeAtualId) !== l.classeAtualId,
    );
  const todasAbertas = porClasse.every((g) => aberta(g.classe.id, g.alunos));
  const semFaixa = classes.filter(
    (c) => c.idadeMinima === null && c.idadeMaxima === null,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Data da promoção (os alunos mudam a partir dela)
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className={campo}
          />
        </label>
        <Button
          type="button"
          disabled={pending || aplicar.length === 0}
          onClick={async () => {
            const sim = await confirmar({
              titulo:
                aplicar.length === 1
                  ? "Mudar 1 aluno de classe?"
                  : `Mudar ${aplicar.length} alunos de classe?`,
              descricao: `Vale a partir de ${data.split("-").reverse().join("/")}. A classe anterior fica no histórico de cada aluno.`,
              botao: "Aplicar promoção",
            });
            if (!sim) return;
            start(async () => {
              const r = await promoverAction({
                data,
                itens: aplicar.map((l) => ({
                  membroId: l.membroId,
                  classeId: destinoDe(l),
                })),
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
          Sem idade definida (não entram na sugestão):{" "}
          {semFaixa.map((c) => c.nome).join(", ")}. Edite a classe para informar
          a idade mínima e máxima.
        </p>
      ) : null}

      {porClasse.length > 1 ? (
        <button
          type="button"
          className="self-end text-sm text-primary underline underline-offset-4"
          onClick={() =>
            setAbertas(
              Object.fromEntries(
                porClasse.map((g) => [g.classe.id, !todasAbertas]),
              ),
            )
          }
        >
          {todasAbertas ? "Fechar todas" : "Abrir todas"}
        </button>
      ) : null}

      {porClasse.map(({ classe, alunos, mudam }) => {
        const estaAberta = aberta(classe.id, alunos);
        return (
          <section key={classe.id} className="rounded-lg border">
            <h3>
              <button
                type="button"
                aria-expanded={estaAberta}
                aria-controls={`promocao-${classe.id}`}
                onClick={() =>
                  setAbertas((a) => ({ ...a, [classe.id]: !estaAberta }))
                }
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left text-sm"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${estaAberta ? "" : "-rotate-90"}`}
                  aria-hidden
                />
                <span className="font-medium">{classe.nome}</span>
                {classe.idadeMinima !== null || classe.idadeMaxima !== null ? (
                  <span className="text-muted-foreground">
                    · {classe.idadeMinima ?? 0}
                    {classe.idadeMaxima !== null
                      ? ` a ${classe.idadeMaxima}`
                      : "+"}{" "}
                    anos
                  </span>
                ) : null}
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {mudam > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
                      {mudam === 1 ? "1 muda" : `${mudam} mudam`}
                    </span>
                  ) : null}
                  {alunos.length === 1 ? "1 aluno" : `${alunos.length} alunos`}
                </span>
              </button>
            </h3>
            <ul
              id={`promocao-${classe.id}`}
              hidden={!estaAberta}
              className="flex flex-col divide-y border-t"
            >
              {alunos.map((l) => {
                const idade = idadeEm(l.nascimento, data);
                return (
                  <li
                    key={l.membroId}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={marcado(l) && muda(l)}
                      disabled={!muda(l)}
                      onChange={(e) =>
                        setMarcados((m) => ({
                          ...m,
                          [l.membroId]: e.target.checked,
                        }))
                      }
                      aria-label={`Promover ${l.nome}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{l.nome}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {idade !== null ? `${idade} anos` : "sem nascimento"}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <select
                      className={campo}
                      value={destinoDe(l)}
                      onChange={(e) =>
                        setDestino((d) => ({
                          ...d,
                          [l.membroId]: e.target.value,
                        }))
                      }
                      aria-label={`Classe de destino de ${l.nome}`}
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id === l.classeAtualId
                            ? `${c.nome} (Atual)`
                            : c.nome}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
