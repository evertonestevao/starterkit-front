"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { GraduationCap, Pencil, Plus, Power, Search, UserMinus, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  adicionarProfessorAction,
  buscarPessoasEbdAction,
  definirClasseAtivaAction,
  encerrarMatriculaAction,
  matricularAction,
  matricularNovoAction,
  removerProfessorAction,
  salvarClasseAction,
} from "@/server/actions/ebd";
import type { ActionState } from "@/server/actions/action-state";
import type { EbdClasse, EbdPessoaBusca } from "@/types/ebd";

/** Roda uma action fora de <form> e mostra o resultado. */
function useRodar() {
  const [pending, start] = useTransition();
  function rodar(acao: () => Promise<ActionState>) {
    start(async () => {
      try {
        const r = await acao();
        if (r.error) toast.error(r.error);
        else if (r.success) toast.success(r.success);
      } catch {
        toast.error("Não foi possível completar a ação. Tente novamente.");
      }
    });
  }
  return { pending, rodar };
}

// ----------------------------------------------------------------- classe
export function ClasseForm({ classe }: { classe?: EbdClasse }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, fd: FormData): Promise<ActionState> => {
      const r = await salvarClasseAction(prev, fd);
      if (r.success) setAberto(false);
      return r;
    },
    undefined,
  );
  useActionToast(state);
  const id = classe?.id ?? "nova";

  return (
    <>
      {classe ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Pencil className="size-3.5" /> Editar classe
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <Plus className="size-4" /> Nova classe
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{classe ? `Editar ${classe.nome}` : "Nova classe"}</DialogTitle>
            <DialogDescription>Ex.: Adultos, Jovens, Juniores (9 a 11 anos), Primários.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            {classe ? <input type="hidden" name="id" value={classe.id} /> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cl-nome-${id}`}>Nome</Label>
              <Input id={`cl-nome-${id}`} name="nome" required minLength={2} maxLength={60} defaultValue={classe?.nome} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cl-faixa-${id}`}>Faixa etária</Label>
                <Input id={`cl-faixa-${id}`} name="faixaEtaria" maxLength={40} placeholder="9 a 11 anos" defaultValue={classe?.faixaEtaria ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cl-sala-${id}`}>Sala</Label>
                <Input id={`cl-sala-${id}`} name="sala" maxLength={40} placeholder="Sala 2" defaultValue={classe?.sala ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cl-imin-${id}`}>Idade mínima</Label>
                <Input id={`cl-imin-${id}`} name="idadeMinima" type="number" min={0} max={120} defaultValue={classe?.idadeMinima ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cl-imax-${id}`}>Idade máxima</Label>
                <Input id={`cl-imax-${id}`} name="idadeMaxima" type="number" min={0} max={120} defaultValue={classe?.idadeMaxima ?? ""} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Usadas para sugerir a classe de cada aluno na promoção. Deixe em branco se não tiver limite.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cl-ordem-${id}`}>Ordem no resumo</Label>
              <Input id={`cl-ordem-${id}`} name="ordem" type="number" min={0} max={999} defaultValue={classe?.ordem ?? 100} className="w-28" />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClasseAtivaBotao({ classe }: { classe: EbdClasse }) {
  const { pending, rodar } = useRodar();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (classe.ativa && !window.confirm(`Encerrar a classe ${classe.nome}? Ela sai do resumo; o histórico fica.`)) return;
        rodar(() => definirClasseAtivaAction(classe.id, !classe.ativa));
      }}
    >
      <Power className="size-3.5" /> {classe.ativa ? "Encerrar classe" : "Reabrir classe"}
    </Button>
  );
}

// ------------------------------------------------------- busca de pessoas
/**
 * Busca no rol (gestão) e devolve a pessoa escolhida. Usada para matricular
 * quem já é membro e para indicar professor.
 */
function BuscaPessoa({
  titulo,
  descricao,
  rotuloBotao,
  onEscolher,
  icone,
}: {
  titulo: string;
  descricao: string;
  rotuloBotao: string;
  onEscolher: (p: EbdPessoaBusca) => Promise<ActionState>;
  icone: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [pessoas, setPessoas] = useState<EbdPessoaBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const { pending, rodar } = useRodar();

  // Busca enquanto digita (com pausa curta), só com a janela aberta.
  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      const r = await buscarPessoasEbdAction(termo);
      if (cancelado) return;
      setCarregando(false);
      if (r.error) toast.error(r.error);
      else setPessoas(r.pessoas ?? []);
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, aberto]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        {icone} {rotuloBotao}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Nome da pessoa" value={termo} onChange={(e) => setTermo(e.target.value)} className="pl-8" aria-label="Buscar pessoa" />
          </div>
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
            {pessoas.map((p) => (
              <li key={p.membroId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.membroIgreja ? "Membro" : "Não membro"}
                    {p.classeAtual ? ` · hoje em ${p.classeAtual}` : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => rodar(async () => {
                    const r = await onEscolher(p);
                    if (r.success) setAberto(false);
                    return r;
                  })}
                >
                  Escolher
                </Button>
              </li>
            ))}
            {!carregando && pessoas.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ninguém encontrado.</li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MatricularMembro({ classe }: { classe: Pick<EbdClasse, "id" | "nome"> }) {
  return (
    <BuscaPessoa
      titulo={`Matricular em ${classe.nome}`}
      descricao="Quem já está em Membros. Se a pessoa estiver em outra classe, ela muda para esta."
      rotuloBotao="Matricular membro"
      icone={<UserPlus className="size-3.5" />}
      onEscolher={(p) => matricularAction(classe.id, p.membroId)}
    />
  );
}

export function AdicionarProfessor({ classe }: { classe: Pick<EbdClasse, "id" | "nome"> }) {
  return (
    <BuscaPessoa
      titulo={`Professor(a) de ${classe.nome}`}
      descricao="Quem tem acesso ao sistema passa a ver esta classe e fazer a chamada dela. Sem acesso, fica só registrado."
      rotuloBotao="Adicionar professor"
      icone={<GraduationCap className="size-3.5" />}
      onEscolher={(p) => adicionarProfessorAction(classe.id, p.membroId)}
    />
  );
}

export function RemoverProfessor({ classeId, membroId, nome }: { classeId: string; membroId: string; nome: string }) {
  const { pending, rodar } = useRodar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Tirar ${nome} de professor`}
      onClick={() => rodar(() => removerProfessorAction(classeId, membroId))}
    >
      <X className="size-4" />
    </Button>
  );
}

// -------------------------------------------------------------- alunos
/** Aluno novo que não está em Membros (ex.: criança). Professor também pode. */
export function NovoAluno({
  classeId,
  visitante,
}: {
  classeId: string;
  visitante?: { id: string; nome: string; telefone: string | null };
}) {
  const [aberto, setAberto] = useState(false);
  // O aviso sai aqui mesmo, e não por efeito: matriculado, o visitante some da
  // lista e este componente desmonta antes de um efeito rodar.
  const [, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, fd: FormData): Promise<ActionState> => {
      const r = await matricularNovoAction(prev, fd);
      if (r.error) toast.error(r.error);
      if (r.success) {
        toast.success(r.success);
        setAberto(false);
      }
      return r;
    },
    undefined,
  );
  const id = visitante?.id ?? "novo";

  return (
    <>
      <Button type="button" variant={visitante ? "outline" : "default"} size="sm" onClick={() => setAberto(true)}>
        <UserPlus className="size-3.5" /> {visitante ? "Matricular" : "Novo aluno"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{visitante ? `Matricular ${visitante.nome}` : "Novo aluno"}</DialogTitle>
            <DialogDescription>
              Para quem ainda não está em Membros (ex.: filho de um membro). Entra como &ldquo;não membro&rdquo; e não aparece
              na chamada dos cultos.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="classeId" value={classeId} />
            {visitante ? <input type="hidden" name="visitanteId" value={visitante.id} /> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`al-nome-${id}`}>Nome</Label>
              <Input id={`al-nome-${id}`} name="nome" required minLength={2} maxLength={120} defaultValue={visitante?.nome} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`al-tel-${id}`}>Telefone</Label>
                <Input id={`al-tel-${id}`} name="telefone" inputMode="tel" maxLength={20} defaultValue={visitante?.telefone ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`al-nasc-${id}`}>Nascimento</Label>
                <Input id={`al-nasc-${id}`} name="nascimento" type="date" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Matricular"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TirarDaClasse({ matriculaId, nome }: { matriculaId: string; nome: string }) {
  const { pending, rodar } = useRodar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Tirar ${nome} da classe? O histórico de presença continua guardado.`)) return;
        rodar(() => encerrarMatriculaAction(matriculaId));
      }}
    >
      <UserMinus className="size-3.5" /> Tirar
    </Button>
  );
}

export function NaoMembroBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Não membro
    </Badge>
  );
}
