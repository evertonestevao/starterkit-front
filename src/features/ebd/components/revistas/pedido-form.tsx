"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { TelefoneInput } from "@/components/telefone-input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarReais } from "@/lib/ebd";
import { buscarPessoasEbdAction } from "@/server/actions/ebd";
import { salvarPedidoRevistaAction } from "@/server/actions/ebdRevistas";
import type { EbdPessoaBusca } from "@/types/ebd";
import type { EbdRevista, EbdRevistaPedido } from "@/types/ebdRevistas";

/** Quem vai pedir, quando o formulário já abre com a pessoa escolhida. */
export interface PessoaDoPedido {
  membroId: string;
  nome: string;
  classeNome: string | null;
}

/**
 * Pedido de revista: quem pede (alguém do cadastro, buscando pelo nome, ou só
 * o nome de alguém de fora) e quantas de cada revista. A revista da classe da
 * pessoa já vem sugerida com 1; o secretário troca à vontade.
 */
export function PedidoForm({
  trimestreId,
  revistas,
  pedido,
  pessoaInicial,
  jaPediram,
  onFechar,
}: {
  trimestreId: string;
  revistas: EbdRevista[];
  /** Alterando um pedido: quem pediu não muda. */
  pedido?: EbdRevistaPedido;
  pessoaInicial?: PessoaDoPedido;
  /** Membros com pedido ativo no trimestre (não entram na busca). */
  jaPediram: Set<string>;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvarPedidoRevistaAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);

  const [pessoa, setPessoa] = useState<PessoaDoPedido | null>(pessoaInicial ?? null);
  const [deFora, setDeFora] = useState(false);
  const sugerida = (classeNome: string | null) =>
    classeNome ? revistas.find((r) => r.classeNome === classeNome)?.id : undefined;
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => {
    if (pedido) return Object.fromEntries(pedido.itens.map((i) => [i.revistaId, i.quantidade]));
    const id = sugerida(pessoaInicial?.classeNome ?? null);
    return id ? { [id]: 1 } : {};
  });

  function escolher(p: PessoaDoPedido) {
    setPessoa(p);
    // Sugere a revista da classe, sem apagar o que o secretário já marcou.
    const id = sugerida(p.classeNome);
    if (id && Object.values(quantidades).every((q) => !q)) setQuantidades({ [id]: 1 });
  }

  const total = revistas.reduce((soma, r) => soma + (quantidades[r.id] ?? 0) * precoDe(r, pedido), 0);
  const algumaRevista = Object.values(quantidades).some((q) => q > 0);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={pedido?.id ?? ""} />
      <input type="hidden" name="trimestreId" value={trimestreId} />
      <input type="hidden" name="membroId" value={pedido ? "" : (pessoa?.membroId ?? "")} />

      {pedido ? (
        <p className="text-sm">
          Pedido de <strong>{pedido.nome}</strong>
          {pedido.classeNome ? <span className="text-muted-foreground"> · {pedido.classeNome}</span> : null}
        </p>
      ) : pessoa ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            <strong>{pessoa.nome}</strong>
            {pessoa.classeNome ? <span className="text-muted-foreground"> · {pessoa.classeNome}</span> : null}
          </span>
          <Button type="button" size="xs" variant="ghost" onClick={() => setPessoa(null)}>
            <X className="size-3" /> Trocar
          </Button>
        </p>
      ) : deFora ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pedido-nome">Nome</Label>
              <Input id="pedido-nome" name="nome" required minLength={2} maxLength={120} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pedido-telefone">Telefone (opcional)</Label>
              <TelefoneInput id="pedido-telefone" name="telefone" />
            </div>
          </div>
          <button
            type="button"
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setDeFora(false)}
          >
            Buscar no cadastro
          </button>
        </div>
      ) : (
        <BuscaDePessoa jaPediram={jaPediram} onEscolher={escolher} onDeFora={() => setDeFora(true)} />
      )}

      {pedido?.deFora ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pedido-nome">Nome</Label>
            <Input id="pedido-nome" name="nome" required minLength={2} maxLength={120} defaultValue={pedido.nome} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pedido-telefone">Telefone (opcional)</Label>
            <TelefoneInput id="pedido-telefone" name="telefone" defaultValue={pedido.telefone ?? ""} />
          </div>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Revistas</legend>
        {revistas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma revista cadastrada neste trimestre. Cadastre em “Revistas do trimestre”.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {revistas.map((r) => {
              const quantidade = quantidades[r.id] ?? 0;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <label htmlFor={`rev-${r.id}`} className="min-w-0">
                    <span className="block truncate font-medium">{r.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatarReais(precoDe(r, pedido))}
                      {r.classeNome ? ` · ${r.classeNome}` : ""}
                    </span>
                  </label>
                  <Input
                    id={`rev-${r.id}`}
                    name={`revista_${r.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={200}
                    value={quantidade === 0 ? "" : quantidade}
                    placeholder="0"
                    onChange={(e) =>
                      setQuantidades((q) => ({ ...q, [r.id]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))
                    }
                    className="w-20 text-right"
                    aria-label={`Quantidade de ${r.titulo}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-right text-sm">
          Total: <strong className="tabular-nums">{formatarReais(total)}</strong>
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pedido-obs">Observação (opcional)</Label>
        <Input
          id="pedido-obs"
          name="observacao"
          maxLength={300}
          defaultValue={pedido?.observacao ?? ""}
          placeholder="Ex.: paga no próximo domingo"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={pending || !algumaRevista || (!pedido && !pessoa && !deFora)}
          onClick={(e) => {
            if (!algumaRevista) {
              e.preventDefault();
              toast.error("Escolha pelo menos uma revista.");
            }
          }}
        >
          {pending ? "Salvando..." : pedido ? "Salvar pedido" : "Registrar pedido"}
        </Button>
      </DialogFooter>
    </Formulario>
  );
}

/** Na alteração, a revista que já estava no pedido mantém o preço de quando entrou. */
function precoDe(revista: EbdRevista, pedido?: EbdRevistaPedido): number {
  return pedido?.itens.find((i) => i.revistaId === revista.id)?.precoCentavos ?? revista.precoCentavos;
}

/** Busca no cadastro (a secretaria da EBD não lê o rol: os nomes vêm pela função do banco). */
function BuscaDePessoa({
  jaPediram,
  onEscolher,
  onDeFora,
}: {
  jaPediram: Set<string>;
  onEscolher: (pessoa: PessoaDoPedido) => void;
  onDeFora: () => void;
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

  const buscando = termo.trim().length >= 2;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pedido-busca">Quem está pedindo</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="pedido-busca"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar pelo nome (aluno, professor ou membro)"
          className="pl-8"
          autoComplete="off"
        />
      </div>
      {buscando && pessoas.length > 0 ? (
        <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border">
          {pessoas.map((p) => {
            const jaPediu = jaPediram.has(p.membroId);
            return (
              <li key={p.membroId}>
                <button
                  type="button"
                  disabled={jaPediu}
                  onClick={() => onEscolher({ membroId: p.membroId, nome: p.nome, classeNome: p.classeAtual })}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
                >
                  <span className="min-w-0 truncate">
                    {p.nome}
                    {p.classeAtual ? <span className="text-muted-foreground"> · {p.classeAtual}</span> : null}
                  </span>
                  {jaPediu ? <span className="shrink-0 text-xs text-muted-foreground">já tem pedido</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : buscando ? (
        <p className="text-xs text-muted-foreground">Ninguém encontrado no cadastro.</p>
      ) : null}
      <button
        type="button"
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={onDeFora}
      >
        Não está no cadastro? Informar só o nome
      </button>
    </div>
  );
}
