"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Formulario } from "@/components/formulario";
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
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarReais } from "@/lib/ebd";
import { cn } from "@/lib/utils";
import { copiarRevistasAction, removerRevistaAction, salvarRevistaAction } from "@/server/actions/ebdRevistas";
import type { EbdRevista } from "@/types/ebdRevistas";

const emReais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/**
 * Revistas e preços do trimestre: o que a EBD oferece e quanto cada pessoa
 * paga. É daqui que saem as opções do pedido. Dá para trazer a lista de outro
 * trimestre e só acertar os preços.
 */
export function RevistasDoTrimestre({
  trimestreId,
  trimestreNome,
  revistas,
  classes,
  outrosTrimestres,
}: {
  trimestreId: string;
  trimestreNome: string;
  revistas: EbdRevista[];
  classes: Array<{ id: string; nome: string }>;
  outrosTrimestres: Array<{ id: string; nome: string }>;
}) {
  const [editando, setEditando] = useState<EbdRevista | "nova" | null>(null);
  const [copiarDe, setCopiarDe] = useState("");
  const [pending, startTransition] = useTransition();

  function rodar(acao: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  }

  const copiar =
    outrosTrimestres.length > 0 ? (
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">Copiar as revistas e os preços de outro trimestre</span>
          <select
            className={cn(selectClasses, "min-w-56")}
            value={copiarDe}
            onChange={(e) => setCopiarDe(e.target.value)}
            aria-label="Trimestre de onde copiar"
          >
            <option value="">Escolha o trimestre</option>
            {outrosTrimestres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !copiarDe}
          onClick={() => rodar(() => copiarRevistasAction(copiarDe, trimestreId))}
        >
          <Copy className="size-4" /> Copiar
        </Button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="font-medium">Revistas e preços do {trimestreNome}</p>
          <p className="text-sm text-muted-foreground">
            Cadastre aqui cada revista que a EBD vai oferecer neste trimestre e o preço que a pessoa paga. Ao registrar
            um pedido, o secretário escolhe entre estas revistas.
          </p>
        </div>
        <Button type="button" onClick={() => setEditando("nova")}>
          <Plus className="size-4" /> Nova revista
        </Button>
      </div>

      {revistas.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed p-5">
          <ol className="flex flex-col gap-2 text-sm">
            <li>
              <strong>1. Cadastre as revistas.</strong> Uma linha para cada tipo: por exemplo “Adultos – aluno”,
              “Adultos – professor”, “Juniores – aluno”.
            </li>
            <li>
              <strong>2. Informe o preço de cada uma.</strong> É o valor que a pessoa paga à EBD.
            </li>
            <li>
              <strong>3. Se quiser, ligue a revista a uma classe.</strong> Aí, no pedido de um aluno daquela classe, ela
              já vem marcada.
            </li>
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" onClick={() => setEditando("nova")}>
              <Plus className="size-4" /> Cadastrar a primeira revista
            </Button>
            {copiar}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <div className="hidden grid-cols-[1fr_8rem_12rem_9rem] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Revista</span>
              <span className="text-right">Preço</span>
              <span>Sugerida para a classe</span>
              <span />
            </div>
            <ul className="flex flex-col divide-y">
              {revistas.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm sm:grid-cols-[1fr_8rem_12rem_9rem]"
                >
                  <span className="min-w-0 truncate font-medium">{r.titulo}</span>
                  <span className="text-right text-base font-semibold tabular-nums">
                    {formatarReais(r.precoCentavos)}
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    <span className="sm:hidden">Sugerida para: </span>
                    {r.classeNome ?? "nenhuma"}
                  </span>
                  <span className="flex justify-end gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditando(r)}>
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Remover ${r.titulo}`}
                      onClick={async () => {
                        const sim = await confirmar({
                          titulo: `Remover "${r.titulo}" deste trimestre?`,
                          descricao: "Só sai da lista se ninguém tiver pedido esta revista.",
                          botao: "Remover",
                          perigo: true,
                        });
                        if (sim) rodar(() => removerRevistaAction(r.id));
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Mudar o preço vale para os pedidos novos: cada pedido já feito guarda o preço do dia em que foi registrado.
          </p>
          {copiar ? <div className="rounded-lg border border-dashed p-3">{copiar}</div> : null}
        </>
      )}

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando === "nova" ? "Nova revista" : "Editar revista"}</DialogTitle>
            <DialogDescription>{trimestreNome}</DialogDescription>
          </DialogHeader>
          {editando !== null ? (
            <RevistaForm
              trimestreId={trimestreId}
              revista={editando === "nova" ? undefined : editando}
              classes={classes}
              onFechar={() => setEditando(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevistaForm({
  trimestreId,
  revista,
  classes,
  onFechar,
}: {
  trimestreId: string;
  revista?: EbdRevista;
  classes: Array<{ id: string; nome: string }>;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvarRevistaAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={revista?.id ?? ""} />
      <input type="hidden" name="trimestreId" value={trimestreId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revista-titulo">Nome da revista</Label>
        <Input
          id="revista-titulo"
          name="titulo"
          required
          minLength={2}
          maxLength={80}
          placeholder="Ex.: Adultos – aluno"
          defaultValue={revista?.titulo ?? ""}
        />
        <p className="text-xs text-muted-foreground">É como ela aparece no pedido e no resumo da compra.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revista-preco">Preço para a pessoa (R$)</Label>
        <Input
          id="revista-preco"
          name="preco"
          inputMode="decimal"
          required
          placeholder="12,50"
          defaultValue={revista ? emReais(revista.precoCentavos) : ""}
          className="max-w-40"
        />
        <p className="text-xs text-muted-foreground">
          Quanto cada pessoa paga à EBD por uma revista. Use 0 se for de graça.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revista-classe">Sugerir para a classe (opcional)</Label>
        <select id="revista-classe" name="classeId" className={selectClasses} defaultValue={revista?.classeId ?? ""}>
          <option value="">Nenhuma</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          No pedido de um aluno desta classe, esta revista já vem marcada. O secretário pode trocar.
        </p>
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
