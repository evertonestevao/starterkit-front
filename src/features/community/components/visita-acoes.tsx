"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, MessageCircle, Phone, Undo2 } from "lucide-react";
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
import { textareaClasses } from "@/features/acompanhamento/components/campos";
import { hojeISO, linkLigar, linkWhatsapp } from "@/lib/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import { registrarContatoVisitaAction, registrarVisitaAction } from "@/server/actions/community";
import type { PessoaQueVisita, SituacaoVisita } from "@/services/communityService";
import { OcultarPedido } from "./ocultar-pedido";

type Acao = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

/**
 * Ações de um pedido de visita, conforme a etapa:
 *  - aguardando contato: WhatsApp, ligar, "Contato feito", "Visita feita";
 *  - contato feito: os mesmos, com "Alterar contato" e desfazer;
 *  - visitado: desfazer a visita.
 */
export function VisitaAcoes({
  visitorId,
  nome,
  telefone,
  etapa,
  agendadaPara,
  contatoObs,
  quemVisita,
}: {
  visitorId: string;
  nome: string;
  telefone: string;
  etapa: SituacaoVisita;
  agendadaPara: string | null;
  contatoObs: string | null;
  /** Membros com cargo que podem ser marcados como quem visitou. */
  quemVisita: PessoaQueVisita[];
}) {
  const ligar = linkLigar(telefone);
  const whatsapp = linkWhatsapp(
    telefone,
    `A paz do Senhor, ${nome.split(" ")[0]}! Recebemos o seu pedido de visita pela página da igreja. Qual o melhor dia para irmos até você?`,
  );

  if (etapa === "feitas") {
    return (
      <div className="flex flex-wrap gap-2">
        <Desfazer acao={registrarVisitaAction} visitorId={visitorId} rotulo="Desfazer visita" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      ) : null}
      {ligar ? (
        <a href={ligar} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Phone className="size-4" /> Ligar
        </a>
      ) : null}
      <ContatoFeito
        visitorId={visitorId}
        nome={nome}
        jaFeito={etapa === "andamento"}
        agendadaPara={agendadaPara}
        contatoObs={contatoObs}
      />
      <VisitaFeita visitorId={visitorId} nome={nome} quemVisita={quemVisita} />
      {etapa === "andamento" ? (
        <Desfazer acao={registrarContatoVisitaAction} visitorId={visitorId} rotulo="Desfazer contato" />
      ) : null}
      <OcultarPedido tipo="visita" pedidoId={visitorId} />
    </div>
  );
}

/** Toast direto na action: depois de salvar, o pedido pode sair do filtro e este componente desmontar. */
function useAcao(acao: Acao, onSuccess?: () => void) {
  return useActionState(async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
    const result = await acao(prev, formData);
    if (result.error) toast.error(result.error);
    if (result.success) {
      toast.success(result.success);
      onSuccess?.();
    }
    return result;
  }, undefined);
}

function ContatoFeito({
  visitorId,
  nome,
  jaFeito,
  agendadaPara,
  contatoObs,
}: {
  visitorId: string;
  nome: string;
  jaFeito: boolean;
  agendadaPara: string | null;
  contatoObs: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [, formAction, pending] = useAcao(registrarContatoVisitaAction, () => setAberto(false));

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <CalendarClock className="size-4" /> {jaFeito ? "Alterar contato" : "Contato feito"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contato com {nome}</DialogTitle>
            <DialogDescription>
              Registre que já falaram com a pessoa. Se combinaram um dia para a visita, informe a data: o pedido sai de
              &ldquo;aguardando contato&rdquo; e fica à espera da visita.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="visitorId" value={visitorId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`ag-${visitorId}`}>Visita marcada para (opcional)</Label>
              <Input
                id={`ag-${visitorId}`}
                name="agendadaPara"
                type="date"
                defaultValue={agendadaPara ?? ""}
                min={jaFeito ? undefined : hojeISO()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`co-${visitorId}`}>Observação (opcional)</Label>
              <textarea
                id={`co-${visitorId}`}
                name="observacao"
                className={textareaClasses}
                maxLength={500}
                defaultValue={contatoObs ?? ""}
                placeholder="Ex.: prefere à tarde; a filha atende o telefone."
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VisitaFeita({
  visitorId,
  nome,
  quemVisita,
}: {
  visitorId: string;
  nome: string;
  quemVisita: PessoaQueVisita[];
}) {
  const [aberto, setAberto] = useState(false);
  const [, formAction, pending] = useAcao(registrarVisitaAction, () => setAberto(false));

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Check className="size-4" /> Visita feita
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Visita a {nome}</DialogTitle>
            <DialogDescription>Registre quando foi e quem visitou.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="visitorId" value={visitorId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`em-${visitorId}`}>Data da visita</Label>
              <Input id={`em-${visitorId}`} name="visitadoEm" type="date" defaultValue={hojeISO()} max={hojeISO()} required />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">Quem visitou</legend>
              {quemVisita.length > 0 ? (
                <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-md border p-2">
                  {quemVisita.map((q) => (
                    <label key={q.membroId} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="membroIds" value={q.membroId} className="mt-0.5 size-4" />
                      <span>
                        {q.nome}
                        <span className="block text-xs text-muted-foreground">{q.cargos}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhum membro com cargo cadastrado. Escreva abaixo quem visitou.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Marque os membros que foram: é assim que o sistema conta as visitas de cada um.
              </p>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`ou-${visitorId}`}>Outras pessoas (opcional)</Label>
              <Input
                id={`ou-${visitorId}`}
                name="outros"
                maxLength={120}
                placeholder="Quem foi e não está na lista acima"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`obs-${visitorId}`}>Como foi? (opcional)</Label>
              <textarea id={`obs-${visitorId}`} name="observacao" className={textareaClasses} maxLength={1000} />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Registrar visita"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Desfazer({ acao, visitorId, rotulo }: { acao: Acao; visitorId: string; rotulo: string }) {
  const [, formAction, pending] = useAcao(acao);
  return (
    <form action={formAction}>
      <input type="hidden" name="visitorId" value={visitorId} />
      <input type="hidden" name="desfazer" value="1" />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Undo2 className="size-4" /> {rotulo}
      </Button>
    </form>
  );
}
