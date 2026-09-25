"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { CARGO_LABEL, CHURCH_CARGOS } from "@/lib/churchLeaders";
import { addChurchLeaderAction, removeChurchLeaderAction } from "@/server/actions/churchLeaders";
import type { ActionState } from "@/server/actions/action-state";
import type { ChurchCargo, ChurchLeader, ChurchWithLeaders, LeaderInviteRole } from "@/types/churchLeaders";

const selectClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** O acesso ao sistema é uma coisa à parte do cargo; a etiqueta diz em que pé está. */
function AcessoBadge({ leader }: { leader: ChurchLeader }) {
  if (leader.temAcesso) return <Badge variant="secondary">Tem acesso ao sistema</Badge>;
  if (leader.convidadoEm) return <Badge variant="outline">Convite enviado</Badge>;
  return <Badge variant="outline">Só registro</Badge>;
}

function LeaderRow({ churchId, leader }: { churchId: string; leader: ChurchLeader }) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  function remover() {
    startTransition(async () => {
      try {
        const result = await removeChurchLeaderAction(churchId, leader.id);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(result.success ?? "Pessoa removida do cargo.");
        setConfirmando(false);
      } catch {
        toast.error("Não foi possível completar a ação. Tente novamente.");
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{leader.nome}</p>
        <p className="text-xs break-all text-muted-foreground">
          {CARGO_LABEL[leader.cargo]}
          {leader.email ? ` · ${leader.email}` : ""}
          {leader.telefone ? ` · ${leader.telefone}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <AcessoBadge leader={leader} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          onClick={() => setConfirmando(true)}
          aria-label={`Tirar ${leader.nome} do cargo`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tirar {leader.nome} do cargo?</DialogTitle>
            <DialogDescription>
              {leader.nome} deixa de constar como {CARGO_LABEL[leader.cargo]} desta igreja. O acesso ao
              sistema, se houver, é definido pelo papel na equipe e não muda por aqui.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Manter
            </DialogClose>
            <Button type="button" variant="destructive" onClick={remover} disabled={pending}>
              {pending ? "Removendo..." : "Tirar do cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function AddLeaderForm({ churchId }: { churchId: string }) {
  const [cargo, setCargo] = useState<ChurchCargo>("pastor");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [convidar, setConvidar] = useState(false);
  const [papel, setPapel] = useState<LeaderInviteRole>("member");

  // Só limpa quando deu certo: em erro a pessoa não perde o que digitou.
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await addChurchLeaderAction(prev, formData);
      if (result.success) {
        setNome("");
        setEmail("");
        setTelefone("");
        setConvidar(false);
      }
      return result;
    },
    undefined,
  );
  useActionToast(state);

  const podeConvidar = email.trim() !== "";

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-3">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="convidarComo" value={convidar && podeConvidar ? papel : ""} />
      <h4 className="text-sm font-medium">Registrar uma pessoa</h4>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cargo">Cargo</Label>
          <select
            id="cargo"
            name="cargo"
            className={selectClasses}
            value={cargo}
            onChange={(e) => setCargo(e.target.value as ChurchCargo)}
          >
            {CHURCH_CARGOS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail (opcional)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@exemplo.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefone">Telefone (opcional)</Label>
          <Input
            id="telefone"
            name="telefone"
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 90000-0000"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={convidar && podeConvidar}
            disabled={!podeConvidar}
            onChange={(e) => setConvidar(e.target.checked)}
          />
          <span>
            Convidar para acessar o sistema
            <span className="block text-xs text-muted-foreground">
              {podeConvidar
                ? "Enviamos um convite para o e-mail acima. O cargo é só um registro: quem acessa o sistema é definido pelo papel."
                : "Informe o e-mail para poder convidar. Sem convite, a pessoa fica só registrada."}
            </span>
          </span>
        </label>
        {convidar && podeConvidar ? (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="papel">Papel no sistema</Label>
            <select
              id="papel"
              className={selectClasses}
              value={papel}
              onChange={(e) => setPapel(e.target.value as LeaderInviteRole)}
            >
              <option value="member">Membro — acesso operacional</option>
              <option value="admin">Administrador — gerencia equipe e configurações</option>
            </select>
          </div>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={pending || nome.trim().length < 2}>
          {pending ? "Salvando..." : convidar && podeConvidar ? "Registrar e convidar" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Cargos da igreja: quem é o pastor, o presbítero, o secretário. É só
 * identificação — quem acessa o sistema continua sendo decidido pelo papel na
 * equipe. A igreja superior vê o Pastor aqui registrado na lista de igrejas
 * ligadas.
 */
export function ChurchLeadersManager({ igrejas }: { igrejas: ChurchWithLeaders[] }) {
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const igreja = igrejas.find((i) => i.id === churchId) ?? igrejas[0];
  if (!igreja) return null;

  return (
    <div className="flex flex-col gap-5">
      {igrejas.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igreja-cargos">Igreja</Label>
          <select
            id="igreja-cargos"
            className={selectClasses}
            value={igreja.id}
            onChange={(e) => setChurchId(e.target.value)}
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {igreja.leaders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Ninguém registrado ainda. Comece pelo Pastor: é o nome que a igreja superior vê na lista de igrejas
          ligadas.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {igreja.leaders.map((leader) => (
            <LeaderRow key={leader.id} churchId={igreja.id} leader={leader} />
          ))}
        </ul>
      )}

      {/* key: trocar de igreja começa um formulário limpo. */}
      <AddLeaderForm key={igreja.id} churchId={igreja.id} />
    </div>
  );
}
