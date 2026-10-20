"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { useMoneyInput } from "@/hooks/useMoneyInput";
import { FORMAS, FORMA_LABEL, TIPOS, TIPO_LABEL, cultosDaData } from "@/lib/tesouraria";
import { cn } from "@/lib/utils";
import { buscarPessoasTesourariaAction, salvarLancamentoAction } from "@/server/actions/tesouraria";
import type { CultoOpcao, FormaLancamento, Lancamento, PessoaTesouraria, TipoLancamento } from "@/types/tesouraria";

/**
 * Lançar (ou corrigir) um dízimo ou uma oferta. "Salvar e lançar outro"
 * mantém data, culto e tipo: no fim do culto a tesouraria lança os envelopes
 * em sequência, mudando só o nome e o valor.
 */
export function LancamentoDialog({
  cultos,
  hoje,
  lancamento,
}: {
  cultos: CultoOpcao[];
  /** AAAA-MM-DD: data sugerida e limite (não se lança no futuro). */
  hoje: string;
  /** Presente = edição. */
  lancamento?: Lancamento;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {lancamento ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Editar lançamento de ${lancamento.nome ?? TIPO_LABEL[lancamento.tipo]}`}
          onClick={() => setAberto(true)}
        >
          <Pencil className="size-4" />
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)} className="gap-2">
          <Plus className="size-4" /> Novo lançamento
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{lancamento ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription>
              Dízimos e ofertas dos cultos. A oferta da EBD é outro caixa e é lançada na chamada da EBD.
            </DialogDescription>
          </DialogHeader>
          {/* Montado só com a janela aberta: cada abertura começa do zero. */}
          {aberto ? (
            <Formulario cultos={cultos} hoje={hoje} lancamento={lancamento} onFechar={() => setAberto(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Formulario({
  cultos,
  hoje,
  lancamento,
  onFechar,
}: {
  cultos: CultoOpcao[];
  hoje: string;
  lancamento?: Lancamento;
  onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoLancamento>(lancamento?.tipo ?? "dizimo");
  const [data, setData] = useState(lancamento?.data ?? hoje);
  const [scheduleId, setScheduleId] = useState(lancamento?.scheduleId ?? "");
  const [forma, setForma] = useState<FormaLancamento>(lancamento?.forma ?? "dinheiro");
  const [nome, setNome] = useState(lancamento?.nome ?? "");
  const [membroId, setMembroId] = useState(lancamento?.membroId ?? "");
  const [observacao, setObservacao] = useState(lancamento?.observacao ?? "");
  // A chave troca a cada "lançar outro" para o campo de valor voltar vazio.
  const [rodada, setRodada] = useState(0);
  const [pending, start] = useTransition();
  const nomeRef = useRef<HTMLInputElement>(null);

  const opcoes = cultosDaData(cultos, data);
  // Culto escolhido que não é da nova data deixa de valer.
  const cultoValido = opcoes.some((c) => c.id === scheduleId) ? scheduleId : "";

  function enviar(fd: FormData, outro: boolean) {
    start(async () => {
      const r = await salvarLancamentoAction(undefined, fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.success ?? "Lançamento salvo.");
      if (!outro) {
        onFechar();
        return;
      }
      setNome("");
      setMembroId("");
      setObservacao("");
      setRodada((n) => n + 1);
      nomeRef.current?.focus();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const outro = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-outro") === "1";
        enviar(new FormData(e.currentTarget), outro);
      }}
    >
      {lancamento ? <input type="hidden" name="id" value={lancamento.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="membroId" value={tipo === "dizimo" ? membroId : ""} />

      <div className="flex gap-2" role="group" aria-label="Tipo de lançamento">
        {TIPOS.map((t) => (
          <Button
            key={t}
            type="button"
            variant={tipo === t ? "default" : "outline"}
            aria-pressed={tipo === t}
            className="flex-1"
            onClick={() => setTipo(t)}
          >
            {TIPO_LABEL[t]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lanc-data">Data</Label>
          <Input
            id="lanc-data"
            name="data"
            type="date"
            required
            max={hoje}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lanc-culto">Culto</Label>
          <select
            id="lanc-culto"
            name="scheduleId"
            className={selectClasses}
            value={cultoValido}
            onChange={(e) => setScheduleId(e.target.value)}
          >
            <option value="">
              {opcoes.length === 0 ? "Nenhum culto na programação deste dia" : "Sem culto definido"}
            </option>
            {opcoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo} · {c.hora.slice(0, 5)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tipo === "dizimo" ? (
        <CampoDizimista
          inputRef={nomeRef}
          nome={nome}
          membroId={membroId}
          onMudar={(n, id) => {
            setNome(n);
            setMembroId(id);
          }}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoValor key={rodada} inicial={rodada === 0 ? (lancamento?.valorCentavos ?? null) : null} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lanc-forma">Como foi recebido</Label>
          <select
            id="lanc-forma"
            name="forma"
            className={selectClasses}
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaLancamento)}
          >
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {FORMA_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lanc-obs">Observação (opcional)</Label>
        <Input
          id="lanc-obs"
          name="observacao"
          maxLength={300}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder={tipo === "oferta" ? "Ex.: oferta de missões" : "Ex.: referente a setembro"}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        {!lancamento ? (
          <Button type="submit" variant="outline" data-outro="1" disabled={pending}>
            Salvar e lançar outro
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

function CampoValor({ inicial }: { inicial: number | null }) {
  const valor = useMoneyInput(inicial);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="lanc-valor">Valor</Label>
      <Input
        id="lanc-valor"
        name="valor"
        required
        inputMode="numeric"
        placeholder="R$ 0,00"
        autoComplete="off"
        value={valor.value}
        onChange={valor.onChange}
      />
    </div>
  );
}

/**
 * De quem é o dízimo: digita o nome e escolhe a pessoa do rol na lista. Quem
 * não é do rol fica só com o nome digitado; em branco é "sem nome".
 */
function CampoDizimista({
  inputRef,
  nome,
  membroId,
  onMudar,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  nome: string;
  membroId: string;
  onMudar: (nome: string, membroId: string) => void;
}) {
  const [sugestoes, setSugestoes] = useState<PessoaTesouraria[]>([]);
  const [aberta, setAberta] = useState(false);

  // Busca enquanto digita (com pausa curta); com a pessoa já escolhida não busca.
  useEffect(() => {
    const termo = nome.trim();
    if (membroId || termo.length < 2) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      const r = await buscarPessoasTesourariaAction(termo);
      if (cancelado) return;
      setSugestoes(r.pessoas ?? []);
      setAberta(true);
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [nome, membroId]);

  const mostrar = aberta && !membroId && nome.trim().length >= 2 && sugestoes.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="lanc-nome">De quem é o dízimo</Label>
      <div className="relative">
        <Input
          id="lanc-nome"
          ref={inputRef}
          name="nome"
          maxLength={120}
          autoComplete="off"
          placeholder="Digite o nome (em branco = sem nome)"
          value={nome}
          onChange={(e) => onMudar(e.target.value, "")}
          onBlur={() => setTimeout(() => setAberta(false), 150)}
          className={cn(membroId && "pr-9")}
          role="combobox"
          aria-expanded={mostrar}
          aria-controls="lanc-nome-sugestoes"
          aria-autocomplete="list"
        />
        {membroId ? (
          <button
            type="button"
            aria-label="Trocar a pessoa"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onMudar("", "");
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {mostrar ? (
          <ul
            id="lanc-nome-sugestoes"
            role="listbox"
            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
          >
            {sugestoes.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  // mousedown: escolhe antes de o campo perder o foco e fechar a lista.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onMudar(p.nome, p.id);
                    setAberta(false);
                  }}
                >
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {membroId
          ? "Ligado ao cadastro de membros."
          : "Escolha na lista para ligar ao cadastro de membros, ou deixe só o nome se a pessoa não for do rol."}
      </p>
    </div>
  );
}
