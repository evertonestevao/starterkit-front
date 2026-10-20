"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, RotateCcw } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAMPOS, DOCUMENTO_LABEL, camposDesconhecidos } from "@/lib/documentosMembro";
import { cn } from "@/lib/utils";
import { restaurarModeloAction, salvarModeloAction } from "@/server/actions/secretaria";
import type { ModeloDocumento } from "@/types/secretaria";

const ORIGEM: Record<ModeloDocumento["origem"], (nome: string | null) => string> = {
  padrao: () => "Texto padrão da plataforma. Ao salvar, passa a valer o texto desta igreja.",
  herdado: (nome) => `Texto definido por ${nome ?? "uma igreja acima"}. Ao salvar, esta igreja passa a usar o próprio.`,
  propria: () => "Texto desta igreja. Vale também para as igrejas abaixo dela que não tiverem o próprio.",
};

/**
 * Texto de um documento. Os campos entre chaves são trocados pelos dados do
 * membro na hora de emitir; clicar num campo da lista o insere onde está o
 * cursor. Linha em branco separa os parágrafos.
 */
export function ModeloDocumentoForm({ modelo }: { modelo: ModeloDocumento }) {
  const [pending, salvar] = useTransition();
  const [titulo, setTitulo] = useState(modelo.titulo);
  const [corpo, setCorpo] = useState(modelo.corpo);
  const [restaurando, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const mudou = titulo !== modelo.titulo || corpo !== modelo.corpo;
  const estranhos = camposDesconhecidos(`${titulo}\n${corpo}`);

  function inserir(chave: string) {
    const el = area.current;
    const campo = `{${chave}}`;
    const inicio = el?.selectionStart ?? corpo.length;
    const fim = el?.selectionEnd ?? corpo.length;
    setCorpo(corpo.slice(0, inicio) + campo + corpo.slice(fim));
    // Devolve o cursor para depois do campo inserido.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + campo.length, inicio + campo.length);
    });
  }

  async function restaurar() {
    const sim = await confirmar({
      titulo: `Restaurar o texto de “${DOCUMENTO_LABEL[modelo.tipo]}”?`,
      descricao: "O texto desta igreja é descartado e volta a valer o da igreja acima, ou o padrão da plataforma.",
      botao: "Restaurar",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await restaurarModeloAction(modelo.tipo);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Modelo restaurado.");
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // O aviso sai daqui, e não de um estado do formulário: ao salvar, a
        // página troca a chave deste componente e ele é montado de novo.
        salvar(async () => {
          const r = await salvarModeloAction(undefined, fd);
          if (r.error) toast.error(r.error);
          else toast.success(r.success ?? "Modelo salvo.");
        });
      }}
    >
      <input type="hidden" name="tipo" value={modelo.tipo} />
      <p className="text-xs text-muted-foreground">{ORIGEM[modelo.origem](modelo.origemNome)}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`titulo-${modelo.tipo}`}>Título</Label>
        <Input
          id={`titulo-${modelo.tipo}`}
          name="titulo"
          required
          minLength={3}
          maxLength={120}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`corpo-${modelo.tipo}`}>Texto</Label>
        <textarea
          id={`corpo-${modelo.tipo}`}
          ref={area}
          name="corpo"
          required
          minLength={20}
          maxLength={4000}
          rows={10}
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-6 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          Deixe uma linha em branco entre os parágrafos. A data e a assinatura do Pastor entram sozinhas no fim.{" "}
          {corpo.length}/4000
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Campos — clique para colocar no texto</p>
        <ul className="flex flex-wrap gap-1.5">
          {CAMPOS.map((c) => (
            <li key={c.chave}>
              <button
                type="button"
                title={c.descricao}
                onClick={() => inserir(c.chave)}
                className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs hover:bg-muted"
              >
                {`{${c.chave}}`}
              </button>
            </li>
          ))}
        </ul>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">O que cada campo coloca</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {CAMPOS.map((c) => (
              <li key={c.chave}>
                <span className="font-mono">{`{${c.chave}}`}</span> — {c.descricao}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {estranhos.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Campo desconhecido: {estranhos.map((c) => `{${c}}`).join(", ")}. Use só os campos da lista acima.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !mudou || estranhos.length > 0}>
          {pending ? "Salvando..." : "Salvar texto"}
        </Button>
        <a
          href={`/dashboard/settings/documentos/exemplo?tipo=${modelo.tipo}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
        >
          <Eye className="size-4" /> Ver exemplo em PDF
        </a>
        {modelo.origem === "propria" ? (
          <Button type="button" variant="ghost" className="gap-2" disabled={restaurando} onClick={restaurar}>
            <RotateCcw className="size-4" /> Restaurar
          </Button>
        ) : null}
        {mudou ? <span className="text-xs text-muted-foreground">O exemplo mostra o texto já salvo.</span> : null}
      </div>
    </form>
  );
}
