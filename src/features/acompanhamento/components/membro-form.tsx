"use client";

import { useActionState, useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
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
import { salvarMembroAction } from "@/server/actions/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import type { RolMembro } from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";
import { selectClasses, textareaClasses } from "./campos";

/**
 * Cadastro e edição de membro do rol, num diálogo. Com `podeConvidar`
 * (owner/admin, pessoa ainda sem acesso nem convite), o e-mail preenchido
 * libera "Convidar para acessar o sistema" — desmarcado por padrão.
 */
export function MembroForm({
  membro,
  cargos,
  podeConvidar = false,
}: {
  membro?: RolMembro;
  cargos: CargoResumo[];
  podeConvidar?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState(membro?.email ?? "");
  const [convidar, setConvidar] = useState(false);
  const [papel, setPapel] = useState<"member" | "admin">("member");
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await salvarMembroAction(prev, formData);
      if (result.success) {
        setAberto(false);
        setConvidar(false);
      }
      return result;
    },
    undefined,
  );
  useActionToast(state);
  const id = membro?.id ?? "novo";

  return (
    <>
      {membro ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <UserPlus className="size-4" /> Novo membro
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        {/* Formulário longo: rola dentro da janela em vez de passar da tela. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{membro ? `Editar ${membro.nome}` : "Novo membro"}</DialogTitle>
            <DialogDescription>Só o nome é obrigatório. O WhatsApp ajuda a falar com a pessoa quando ela sumir.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            {membro ? <input type="hidden" name="id" value={membro.id} /> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nome-${id}`}>Nome</Label>
              <Input id={`nome-${id}`} name="nome" defaultValue={membro?.nome} required minLength={2} maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`whatsapp-${id}`}>WhatsApp / telefone</Label>
              <Input
                id={`whatsapp-${id}`}
                name="whatsapp"
                inputMode="tel"
                placeholder="(11) 98888-7777"
                defaultValue={membro?.whatsapp ?? ""}
                maxLength={20}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${id}`}>E-mail (opcional)</Label>
              <Input
                id={`email-${id}`}
                name="email"
                type="email"
                placeholder="Para convidar a pessoa ao sistema"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                // Quem já tem login usa o e-mail da conta; trocar aqui não troca o login.
                readOnly={Boolean(membro?.userId)}
              />
              {membro?.userId ? (
                <span className="text-xs text-muted-foreground">É o e-mail do login desta pessoa.</span>
              ) : null}
            </div>
            {podeConvidar && emailValido ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                <input type="hidden" name="convidarComo" value={convidar ? papel : ""} />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={convidar}
                    onChange={(e) => setConvidar(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Convidar para acessar o sistema
                    <span className="block text-xs text-muted-foreground">
                      Ao salvar, enviamos um convite para este e-mail. Sem marcar, o e-mail fica só como contato.
                    </span>
                  </span>
                </label>
                {convidar ? (
                  <select
                    aria-label="Papel no sistema"
                    className={selectClasses}
                    value={papel}
                    onChange={(e) => setPapel(e.target.value as "member" | "admin")}
                  >
                    <option value="member">Membro — acesso operacional</option>
                    <option value="admin">Administrador — gerencia equipe e configurações</option>
                  </select>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nascimento-${id}`}>Data de nascimento (opcional)</Label>
              <Input id={`nascimento-${id}`} name="nascimento" type="date" defaultValue={membro?.nascimento ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`batismo-${id}`}>Data de batismo (opcional)</Label>
              <Input id={`batismo-${id}`} name="batismo" type="date" defaultValue={membro?.batismo ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`obs-${id}`}>Observações (opcional)</Label>
              <textarea
                id={`obs-${id}`}
                name="observacoes"
                className={textareaClasses}
                defaultValue={membro?.observacoes ?? ""}
                maxLength={1000}
              />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <input type="hidden" name="cargosEnviados" value="1" />
              <legend className="mb-1 text-sm font-medium">Cargos</legend>
              <CargosCheckboxes membro={membro} cargos={cargos} />
            </fieldset>
            <input type="hidden" name="participaEnviado" value="1" />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="membroIgreja"
                defaultChecked={membro?.membroIgreja ?? true}
                className="mt-0.5 size-4"
              />
              <span>
                Faz parte do quadro de membros
                <span className="block text-xs text-muted-foreground">
                  Desmarque para congregados e crianças (ex.: aluno da EBD) que a igreja ainda não recebeu como membro.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="participaChamada"
                defaultChecked={membro?.participaChamada ?? true}
                className="mt-0.5 size-4"
              />
              <span>
                Participa da chamada dos cultos
                <span className="block text-xs text-muted-foreground">
                  Marca presença e falta nos cultos (a chamada da EBD é separada, pela matrícula na classe). Desmarque
                  para quem só administra o sistema (ex.: contador): não aparece na chamada dos cultos nem nos alertas
                  de faltas.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={membro?.ativo ?? true} className="size-4" />
              Ativo (inativo não aparece na chamada nem gera alerta)
            </label>
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

/**
 * Um quadradinho por cargo disponível. Cargo desativado que a pessoa já tinha
 * aparece (marcado) para ela poder manter ou tirar; não aparece para os outros.
 */
function CargosCheckboxes({ membro, cargos }: { membro?: RolMembro; cargos: CargoResumo[] }) {
  const tem = new Set(membro?.cargos.map((c) => c.id) ?? []);
  const antigos = (membro?.cargos ?? []).filter((c) => !cargos.some((d) => d.id === c.id));
  const opcoes = [...cargos, ...antigos];
  if (opcoes.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum cargo cadastrado. Crie em Configurações → Cargos.</p>;
  }
  return (
    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
      {opcoes.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="cargoIds" value={c.id} defaultChecked={tem.has(c.id)} className="size-4" />
          <span className={c.desativado ? "text-muted-foreground" : ""}>
            {c.nome}
            {c.desativado ? " (desativado)" : ""}
          </span>
        </label>
      ))}
    </div>
  );
}
