"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Phone, NotebookPen } from "lucide-react";
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
import { RESULTADOS, RESULTADO_LABEL, hojeISO, linkLigar, linkWhatsapp } from "@/lib/acompanhamento";
import { registrarContatoAction } from "@/server/actions/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import type { MotivoContato } from "@/types/acompanhamento";
import { selectClasses, textareaClasses } from "./campos";

/**
 * Os três botões de cada pessoa em alerta: WhatsApp (mensagem pronta e
 * editável), ligar e registrar o contato feito.
 */
/** Action que registra o contato (a dos cultos por padrão; a EBD passa a dela). */
type RegistrarAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

export function ContatoAcoes({
  membroId,
  nome,
  telefone,
  mensagemPadrao,
  motivo,
  registrar = registrarContatoAction,
  extras,
}: {
  membroId: string;
  nome: string;
  telefone: string | null;
  mensagemPadrao: string;
  motivo: MotivoContato;
  registrar?: RegistrarAction;
  /** Campos escondidos a mais no formulário de contato (ex.: classeId da EBD). */
  extras?: Record<string, string>;
}) {
  const ligar = linkLigar(telefone);

  return (
    <div className="flex flex-wrap gap-2">
      <WhatsappBotao nome={nome} telefone={telefone} mensagemPadrao={mensagemPadrao} />
      {ligar ? (
        <a href={ligar} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Phone className="size-4" /> Ligar
        </a>
      ) : null}
      <RegistrarContato membroId={membroId} nome={nome} motivo={motivo} registrar={registrar} extras={extras} />
    </div>
  );
}

function WhatsappBotao({
  nome,
  telefone,
  mensagemPadrao,
}: {
  nome: string;
  telefone: string | null;
  mensagemPadrao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState(mensagemPadrao);
  const link = linkWhatsapp(telefone, mensagem);

  if (!linkWhatsapp(telefone, "")) {
    return (
      <Button type="button" variant="outline" size="lg" disabled title="Sem WhatsApp cadastrado">
        <MessageCircle className="size-4" /> Sem WhatsApp
      </Button>
    );
  }

  return (
    <>
      <Button type="button" size="lg" onClick={() => setAberto(true)}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mensagem para {nome}</DialogTitle>
            <DialogDescription>Ajuste o texto como quiser. O WhatsApp abre com ele pronto.</DialogDescription>
          </DialogHeader>
          <textarea
            className={`${textareaClasses} min-h-32`}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            aria-label="Mensagem"
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <a
              href={link ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAberto(false)}
              className={buttonVariants({ variant: "default" })}
            >
              Abrir WhatsApp
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegistrarContato({
  membroId,
  nome,
  motivo,
  registrar,
  extras,
}: {
  membroId: string;
  nome: string;
  motivo: MotivoContato;
  registrar: RegistrarAction;
  extras?: Record<string, string>;
}) {
  const [aberto, setAberto] = useState(false);
  // O aviso sai aqui: registrado o contato, a pessoa pode sumir da lista e
  // este componente desmontar antes de um efeito rodar.
  const [, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await registrar(prev, formData);
      if (result.error) toast.error(result.error);
      if (result.success) {
        toast.success(result.success);
        setAberto(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => setAberto(true)}>
        <NotebookPen className="size-4" /> Contato feito
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contato com {nome}</DialogTitle>
            <DialogDescription>
              Registre como foi a conversa. &ldquo;Em acompanhamento&rdquo; mantém a pessoa na lista com essa marca; os
              outros resultados tiram da lista até ela voltar a faltar.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="membroId" value={membroId} />
            <input type="hidden" name="motivo" value={motivo} />
            {Object.entries(extras ?? {}).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`resultado-${membroId}`}>Como foi?</Label>
              <select id={`resultado-${membroId}`} name="resultado" className={selectClasses} defaultValue="retornou">
                {RESULTADOS.map((r) => (
                  <option key={r} value={r}>
                    {RESULTADO_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`data-${membroId}`}>Data do contato</Label>
              <Input id={`data-${membroId}`} name="data" type="date" defaultValue={hojeISO()} max={hojeISO()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`obs-${membroId}`}>Observação (opcional)</Label>
              <textarea id={`obs-${membroId}`} name="observacao" className={textareaClasses} maxLength={1000} />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Registrar contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
