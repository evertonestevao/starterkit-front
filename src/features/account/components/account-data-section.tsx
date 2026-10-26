"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { deleteAccountAction } from "@/server/actions/account";

interface AccountDataSectionProps {
  /** Motivos que impedem a exclusão agora (calculados no servidor). */
  blockers: string[];
  /** Empresas só do usuário, encerradas junto com a conta. */
  companiesToClose: string[];
}

/** Direitos do titular: baixar os próprios dados e excluir a conta. */
export function AccountDataSection({ blockers, companiesToClose }: AccountDataSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Baixe uma cópia dos seus dados pessoais em formato JSON.
        </p>
        <a
          href="/api/account/export"
          download
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          <Download className="size-4" />
          Baixar meus dados
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          A exclusão é definitiva: seu perfil, seus acessos e seus arquivos são apagados.
        </p>
        {blockers.length > 0 ? (
          <Alert>
            <AlertDescription>
              <p className="font-medium">Antes de excluir a conta:</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <DeleteAccountButton companiesToClose={companiesToClose} />
        )}
      </div>
    </div>
  );
}

function DeleteAccountButton({ companiesToClose }: { companiesToClose: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      try {
        const result = await deleteAccountAction(confirmation);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        router.push("/"); // navegação no client (sem redirect na action)
      } catch {
        toast.error("Não foi possível excluir a conta. Tente novamente.");
      }
    });
  }

  return (
    <>
      <Button variant="destructive" className="w-fit" onClick={() => setOpen(true)}>
        Excluir minha conta
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir sua conta?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
              {companiesToClose.length > 0
                ? ` Estas empresas, que só têm você como membro, serão encerradas: ${companiesToClose.join(", ")}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirmation">Digite seu email para confirmar</Label>
            <Input
              id="delete-confirmation"
              type="email"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button variant="destructive" disabled={pending || !confirmation} onClick={remove}>
              {pending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
