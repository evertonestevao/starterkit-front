"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { PIX_STATUS_LABEL, explicarPixStatus, type PixStatus } from "@/lib/pixStatus";
import { saveChurchPixAction } from "@/server/actions/churchPix";

const selectClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface PixChurch {
  id: string;
  name: string;
  pixChave: string | null;
  pixTitular: string | null;
  pixStatus: PixStatus;
  pixMotivoRecusa: string | null;
}

/**
 * Cadastro da chave PIX, em dois passos.
 *
 * O segundo passo existe porque uma chave errada não dá erro: ela funciona e
 * manda o dinheiro para outra pessoa. Ver o que vai ser gravado, lado a lado
 * com o que está no ar, é a última chance de perceber um dígito trocado — ou
 * uma alteração que não foi você quem começou.
 */
export function PixForm({ igrejas }: { igrejas: PixChurch[] }) {
  const [state, formAction, pending] = useActionState(saveChurchPixAction, undefined);
  useActionToast(state);
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const [chave, setChave] = useState(igrejas[0]?.pixChave ?? "");
  const [titular, setTitular] = useState(igrejas[0]?.pixTitular ?? "");
  const [confirmando, setConfirmando] = useState(false);

  const igreja = igrejas.find((i) => i.id === churchId);
  const mudou = chave.trim() !== (igreja?.pixChave ?? "") || titular.trim() !== (igreja?.pixTitular ?? "");

  function trocarIgreja(id: string) {
    const alvo = igrejas.find((i) => i.id === id);
    setChurchId(id);
    setChave(alvo?.pixChave ?? "");
    setTitular(alvo?.pixTitular ?? "");
    setConfirmando(false);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="confirmado" value={confirmando ? "true" : "false"} />

      {igreja ? (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            igreja.pixStatus === "recusado"
              ? "border-destructive/40 bg-destructive/5"
              : igreja.pixStatus === "aguardando"
                ? "border-amber-500/40 bg-amber-500/10"
                : "bg-muted/40"
          }`}
        >
          <p className="font-medium">Situação: {PIX_STATUS_LABEL[igreja.pixStatus]}</p>
          <p className="mt-0.5 text-muted-foreground">{explicarPixStatus(igreja.pixStatus, igreja.pixMotivoRecusa)}</p>
        </div>
      ) : null}

      {igrejas.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igreja">Igreja</Label>
          <select
            id="igreja"
            className={selectClasses}
            value={churchId}
            onChange={(e) => trocarIgreja(e.target.value)}
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chave">Chave PIX</Label>
        <Input
          id="chave"
          name="chave"
          required
          value={chave}
          onChange={(e) => {
            setChave(e.target.value);
            setConfirmando(false);
          }}
          placeholder="CPF, CNPJ, e-mail, telefone (+55...) ou chave aleatória"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="titular">Nome do titular</Label>
        <Input
          id="titular"
          name="titular"
          required
          value={titular}
          onChange={(e) => {
            setTitular(e.target.value);
            setConfirmando(false);
          }}
          placeholder="Como aparece na conta da igreja"
        />
        <p className="text-xs text-muted-foreground">
          É este nome que o app do banco mostra para quem vai doar. Se não for o da igreja, quem doa
          percebe na hora — e é assim que uma chave trocada aparece.
        </p>
      </div>

      {confirmando ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-col gap-2">
            <span>Confira antes de salvar. A partir daqui, as doações vão para esta chave:</span>
            <span className="font-medium break-all text-foreground">{chave.trim()}</span>
            <span className="text-foreground">Titular: {titular.trim()}</span>
            <span className="text-xs">
              Todos os administradores recebem um email avisando da troca.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {confirmando ? (
          <>
            <Button type="submit" disabled={pending}>
              Confirmar e salvar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
              Voltar e revisar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            disabled={!mudou || !chave.trim() || !titular.trim()}
            onClick={() => setConfirmando(true)}
          >
            Revisar alteração
          </Button>
        )}
      </div>
    </form>
  );
}
