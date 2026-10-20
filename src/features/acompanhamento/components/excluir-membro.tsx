"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { excluirMembroAction } from "@/server/actions/acompanhamento";

/**
 * Excluir um cadastro feito por engano. Pede confirmação e explica o que
 * some e o que fica; para tirar alguém só da chamada, o caminho é "Inativo".
 */
export function ExcluirMembro({ membroId, nome }: { membroId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  function excluir() {
    startTransition(async () => {
      const result = await excluirMembroAction(membroId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Cadastro excluído.");
      setAberto(false);
      // A ficha deixou de existir: volta para a lista.
      router.push("/dashboard/membros");
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Trash2 className="size-3.5" /> Excluir
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {nome}?</DialogTitle>
            <DialogDescription>
              Use para cadastro feito por engano ou repetido. O cadastro sai da lista de membros, dos cargos e da classe
              da EBD. As presenças já registradas nos cultos continuam nos relatórios.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se a pessoa só deixou de frequentar, prefira editar e desmarcar &ldquo;Ativo&rdquo;: o histórico dela fica
            guardado na ficha.
          </p>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={excluir}>
              {pending ? "Excluindo..." : "Excluir cadastro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
