"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { HeartPulse, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { linkLigar } from "@/lib/acompanhamento";
import { PARENTESCOS } from "@/lib/ebd";
import {
  buscarPessoasEbdAction,
  removerResponsavelAction,
  salvarCuidadosAction,
  salvarResponsavelAction,
} from "@/server/actions/ebd";
import type { ActionState } from "@/server/actions/action-state";
import type { EbdPessoaBusca, EbdResponsavel } from "@/types/ebd";

const campo =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Responsáveis (pai, mãe, avó...) e cuidados (alergias, medicação) de um
 * aluno. Dado sensível: só quem cuida do aluno abre — o banco confere.
 * `podeEscolherMembro`: a gestão pode ligar o responsável a alguém de Membros
 * (o professor não lê o rol, então digita nome e telefone).
 */
export function ResponsaveisBotao({
  membro,
  responsaveis,
  cuidados,
  podeEscolherMembro,
  rotulo = "Responsáveis",
}: {
  membro: { id: string; nome: string };
  responsaveis: EbdResponsavel[];
  cuidados: string | null;
  podeEscolherMembro: boolean;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <Users className="size-3.5" /> {rotulo}
        {responsaveis.length > 0 ? <Badge variant="secondary">{responsaveis.length}</Badge> : null}
        {cuidados ? <HeartPulse className="size-3.5 text-red-600" aria-label="tem cuidados anotados" /> : null}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{membro.nome}</DialogTitle>
            <DialogDescription>Responsáveis e cuidados. Só quem cuida da classe ou do rol vê.</DialogDescription>
          </DialogHeader>
          <Cuidados membroId={membro.id} inicial={cuidados} />
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Responsáveis</h4>
            {responsaveis.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum responsável cadastrado.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {responsaveis.map((r) => (
                  <ItemResponsavel key={r.id} r={r} />
                ))}
              </ul>
            )}
            <NovoResponsavel membroId={membro.id} podeEscolherMembro={podeEscolherMembro} />
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Cuidados({ membroId, inicial }: { membroId: string; inicial: string | null }) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
      <Label htmlFor={`cuidados-${membroId}`} className="flex items-center gap-1.5">
        <HeartPulse className="size-4 text-red-600" /> Cuidados (alergias, medicação)
      </Label>
      <textarea
        id={`cuidados-${membroId}`}
        className={`${campo} min-h-16 py-2`}
        maxLength={500}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex.: alergia a amendoim; usa bombinha de asma"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={pending || texto === (inicial ?? "")}
        onClick={() =>
          start(async () => {
            const r = await salvarCuidadosAction(membroId, texto);
            if (r.error) toast.error(r.error);
            else toast.success(r.success ?? "Salvo.");
          })
        }
      >
        {pending ? "Salvando..." : "Salvar cuidados"}
      </Button>
    </section>
  );
}

function ItemResponsavel({ r }: { r: EbdResponsavel }) {
  const [pending, start] = useTransition();
  const ligar = linkLigar(r.telefone);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{r.nome}</span>
        <span className="text-muted-foreground"> · {r.parentesco}</span>
        <span className="block text-xs text-muted-foreground">
          {r.telefone ?? "sem telefone"}
          {r.podeBuscar ? " · pode buscar a criança" : " · NÃO pode buscar"}
          {r.responsavelId ? " · está em Membros" : ""}
        </span>
      </span>
      <span className="flex gap-1">
        {ligar ? (
          <a href={ligar} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label={`Ligar para ${r.nome}`}>
            <Phone className="size-4" />
          </a>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={`Remover ${r.nome}`}
          onClick={() =>
            start(async () => {
              const res = await removerResponsavelAction(r.id);
              if (res.error) toast.error(res.error);
              else toast.success(res.success ?? "Removido.");
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </span>
    </li>
  );
}

function NovoResponsavel({ membroId, podeEscolherMembro }: { membroId: string; podeEscolherMembro: boolean }) {
  const [escolhido, setEscolhido] = useState<EbdPessoaBusca | null>(null);
  const [chave, setChave] = useState(0); // remonta o formulário limpo depois de salvar
  const [, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, fd: FormData): Promise<ActionState> => {
      const r = await salvarResponsavelAction(prev, fd);
      if (r.error) toast.error(r.error);
      if (r.success) {
        toast.success(r.success);
        setEscolhido(null);
        setChave((k) => k + 1);
      }
      return r;
    },
    undefined,
  );

  return (
    <form key={chave} action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <h5 className="text-sm font-medium">Adicionar responsável</h5>
      <input type="hidden" name="membroId" value={membroId} />
      <input type="hidden" name="responsavelId" value={escolhido?.membroId ?? ""} />
      {podeEscolherMembro ? <EscolherMembro escolhido={escolhido} onEscolher={setEscolhido} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {!escolhido ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`resp-nome-${membroId}`}>Nome</Label>
            <Input id={`resp-nome-${membroId}`} name="nome" maxLength={120} required />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`resp-par-${membroId}`}>Parentesco</Label>
          <select id={`resp-par-${membroId}`} name="parentesco" className={campo} defaultValue="Mãe">
            {PARENTESCOS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`resp-tel-${membroId}`}>Telefone {escolhido ? "(em branco: o de Membros)" : ""}</Label>
          <TelefoneInput id={`resp-tel-${membroId}`} name="telefone" autoComplete="off" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="podeBuscar" defaultChecked className="size-4" />
        Pode buscar a criança na saída
      </label>
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        <UserPlus className="size-3.5" /> {pending ? "Salvando..." : "Adicionar"}
      </Button>
    </form>
  );
}

/** Busca simples em Membros (só a gestão da EBD). */
function EscolherMembro({
  escolhido,
  onEscolher,
}: {
  escolhido: EbdPessoaBusca | null;
  onEscolher: (p: EbdPessoaBusca | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [pessoas, setPessoas] = useState<EbdPessoaBusca[]>([]);

  useEffect(() => {
    if (termo.trim().length < 2) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      const r = await buscarPessoasEbdAction(termo);
      if (!cancelado) setPessoas(r.pessoas ?? []);
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo]);

  if (escolhido) {
    return (
      <p className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm">
        <span>
          Em Membros: <strong>{escolhido.nome}</strong>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEscolher(null)}>
          Trocar
        </Button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar em Membros (opcional)"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          className="pl-8"
          aria-label="Buscar responsável em Membros"
        />
      </div>
      {termo.trim().length >= 2 && pessoas.length > 0 ? (
        <ul className="flex max-h-36 flex-col divide-y overflow-y-auto rounded-md border text-sm">
          {pessoas.map((p) => (
            <li key={p.membroId}>
              <button type="button" className="w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => onEscolher(p)}>
                {p.nome}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
