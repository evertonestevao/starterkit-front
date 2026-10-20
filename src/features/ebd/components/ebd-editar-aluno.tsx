"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { TelefoneInput } from "@/components/telefone-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { editarAlunoEbdAction } from "@/server/actions/ebd";

/**
 * Editar os dados do aluno que a EBD cadastrou e que ainda não é membro.
 * Depois que vira membro, os dados são da secretaria (o banco recusa aqui).
 */
export function EditarAlunoEbd({
  aluno,
}: {
  aluno: { membroId: string; nome: string; whatsapp: string | null; nascimento: string | null };
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Pencil className="size-3.5" /> Editar dados
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar dados do aluno</DialogTitle>
            <DialogDescription>
              Só para aluno cadastrado pela EBD que ainda não é membro. Quando ele virar membro, os dados passam a ser
              alterados em Membros, pela secretaria da igreja.
            </DialogDescription>
          </DialogHeader>
          {/* Só montado com o diálogo aberto: ao reabrir, os campos vêm com os dados atuais. */}
          {aberto ? <FormularioDoAluno aluno={aluno} onFechar={() => setAberto(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioDoAluno({
  aluno,
  onFechar,
}: {
  aluno: { membroId: string; nome: string; whatsapp: string | null; nascimento: string | null };
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(editarAlunoEbdAction, undefined);
  useActionToast(state);
  // Valores de quando o formulário abriu: depois de salvar a página manda os
  // novos, e trocar o valor inicial de um campo já montado gera aviso.
  const [inicial] = useState(aluno);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="membroId" value={inicial.membroId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="aluno-nome">Nome</Label>
        <Input id="aluno-nome" name="nome" required minLength={2} maxLength={120} defaultValue={inicial.nome} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aluno-telefone">Telefone</Label>
          <TelefoneInput id="aluno-telefone" name="telefone" defaultValue={inicial.whatsapp ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aluno-nascimento">Data de nascimento</Label>
          <Input id="aluno-nascimento" name="nascimento" type="date" defaultValue={inicial.nascimento ?? ""} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </Formulario>
  );
}
