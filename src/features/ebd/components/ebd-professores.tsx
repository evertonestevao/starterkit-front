"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, UserPlus, X } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adicionarProfessorAction,
  buscarPessoasEbdAction,
  darCargoProfessorAction,
  removerProfessorAction,
  tirarCargoProfessorAction,
} from "@/server/actions/ebd";
import type { ActionState } from "@/server/actions/action-state";
import type { EbdPessoaBusca, EbdProfessorDaIgreja } from "@/types/ebd";

type Filtro = "todos" | "disponiveis" | "dando_aula";

/**
 * Professores da EBD: quem tem o cargo e quem dá aula. A gestão dá o cargo,
 * põe e tira das classes. O login (entrar no sistema) continua sendo do
 * Responsável, na ficha do membro.
 */
export function EbdProfessores({
  professores,
  classes,
}: {
  professores: EbdProfessorDaIgreja[];
  classes: Array<{ id: string; nome: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>("todos");

  function rodar(acao: () => Promise<ActionState>) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  }

  const disponiveis = professores.filter((p) => p.temCargo && p.classes.length === 0).length;
  const lista = professores.filter((p) =>
    filtro === "disponiveis"
      ? p.temCargo && p.classes.length === 0
      : filtro === "dando_aula"
        ? p.classes.length > 0
        : true,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quem tem o cargo de Professor(a) da EBD e em quais classes dá aula. Para entrar no sistema e fazer a chamada, o
        professor precisa de login, que o Responsável libera na ficha do membro.
      </p>

      <DarCargo
        jaProfessores={new Set(professores.filter((p) => p.temCargo).map((p) => p.membroId))}
        rodar={rodar}
        pending={pending}
      />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar professores">
        {(
          [
            ["todos", `Todos (${professores.length})`],
            ["disponiveis", `Sem classe (${disponiveis})`],
            ["dando_aula", "Dando aula"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={filtro === valor}
            onClick={() => setFiltro(valor)}
            className={`rounded-full border px-3 py-1 text-sm ${filtro === valor ? "border-primary bg-primary/10 font-medium" : ""}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {professores.length === 0
            ? "Nenhum professor ainda. Busque uma pessoa acima para dar o cargo."
            : "Ninguém neste filtro."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((p) => {
            const livres = classes.filter((c) => !p.classes.some((pc) => pc.id === c.id));
            return (
              <li key={p.membroId} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.nome}</span>
                  <Badge variant="secondary">
                    {p.classes.length === 0
                      ? "Sem classe"
                      : p.classes.length === 1
                        ? "1 classe"
                        : `${p.classes.length} classes`}
                  </Badge>
                  {!p.temLogin ? <Badge variant="outline">Sem login</Badge> : null}
                  {!p.temCargo ? <Badge variant="outline">Sem o cargo</Badge> : null}
                </div>

                {p.classes.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {p.classes.map((c) => (
                      <li key={c.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-3 pr-1 text-sm">
                        {c.nome}
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Tirar ${p.nome} da classe ${c.nome}`}
                          className="rounded-full p-0.5 hover:bg-background"
                          onClick={async () => {
                            const sim = await confirmar({
                              titulo: `Tirar ${p.nome} da classe ${c.nome}?`,
                              descricao: "A pessoa deixa de ver essa classe e de fazer a chamada dela.",
                              botao: "Tirar da classe",
                              perigo: true,
                            });
                            if (sim) rodar(() => removerProfessorAction(c.id, p.membroId));
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {livres.length > 0 ? (
                    <select
                      aria-label={`Pôr ${p.nome} numa classe`}
                      disabled={pending}
                      value=""
                      onChange={(e) => {
                        const classeId = e.target.value;
                        if (classeId) rodar(() => adicionarProfessorAction(classeId, p.membroId));
                      }}
                      className="h-8 rounded-lg border bg-background px-2 text-sm"
                    >
                      <option value="">Pôr numa classe…</option>
                      {livres.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {p.temCargo ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || p.classes.length > 0}
                      title={p.classes.length > 0 ? "Tire a pessoa das classes antes" : undefined}
                      onClick={async () => {
                        const sim = await confirmar({
                          titulo: `Tirar o cargo de professor de ${p.nome}?`,
                          descricao: "O cadastro de membro continua; só o cargo sai.",
                          botao: "Tirar o cargo",
                          perigo: true,
                        });
                        if (sim) rodar(() => tirarCargoProfessorAction(p.membroId));
                      }}
                    >
                      Tirar o cargo
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => rodar(() => darCargoProfessorAction(p.membroId))}
                    >
                      Dar o cargo
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Busca no rol para dar o cargo (a secretaria da EBD não lê o rol: vem pela função do banco). */
function DarCargo({
  jaProfessores,
  rodar,
  pending,
}: {
  jaProfessores: Set<string>;
  rodar: (acao: () => Promise<ActionState>) => void;
  pending: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [pessoas, setPessoas] = useState<EbdPessoaBusca[]>([]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) return;
    const id = setTimeout(async () => {
      const r = await buscarPessoasEbdAction(t);
      if (r.error) toast.error(r.error);
      setPessoas(r.pessoas ?? []);
    }, 300);
    return () => clearTimeout(id);
  }, [termo]);

  const mostrar = termo.trim().length >= 2 ? pessoas.filter((p) => !jaProfessores.has(p.membroId)) : [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <label htmlFor="busca-professor" className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4" /> Dar o cargo de professor
      </label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="busca-professor"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome da pessoa (membro da igreja)"
          className="pl-8"
          autoComplete="off"
        />
      </div>
      {mostrar.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {mostrar.slice(0, 8).map((p) => (
            <li key={p.membroId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{p.nome}</span>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  rodar(() => darCargoProfessorAction(p.membroId));
                  setTermo("");
                  setPessoas([]);
                }}
              >
                Dar o cargo
              </Button>
            </li>
          ))}
        </ul>
      ) : termo.trim().length >= 2 ? (
        <p className="text-xs text-muted-foreground">Ninguém encontrado (ou a pessoa já é professora).</p>
      ) : null}
    </div>
  );
}
