"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSignature, FileText, History, IdCard, PencilLine, Plus, Trash2, UserCheck, UserPlus } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarData } from "@/lib/acompanhamento";
import { anotarHistoricoAction, excluirAnotacaoAction } from "@/server/actions/secretaria";
import type { HistoricoItem, TipoHistorico } from "@/types/secretaria";

const ICONE: Record<TipoHistorico, typeof History> = {
  cadastro: UserPlus,
  situacao: UserCheck,
  documento: FileText,
  anotacao: PencilLine,
  consentimento: FileSignature,
  carteirinha: IdCard,
};

/** Quantos aparecem antes do "ver tudo". */
const VISIVEIS = 8;

/**
 * Histórico do membro: o que mudou e quando. Mudanças de situação e
 * documentos emitidos entram sozinhos; a secretaria anota o resto
 * (consagração, disciplina, retorno). Só a anotação à mão pode ser excluída.
 */
export function HistoricoCard({
  membroId,
  nome,
  itens,
  hoje,
}: {
  membroId: string;
  nome: string;
  itens: HistoricoItem[];
  /** AAAA-MM-DD: limite da data (não se anota o futuro). */
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [tudo, setTudo] = useState(false);
  const [pending, start] = useTransition();
  const mostrados = tudo ? itens : itens.slice(0, VISIVEIS);

  async function excluir(item: HistoricoItem) {
    const sim = await confirmar({
      titulo: "Excluir esta anotação?",
      descricao: `“${item.titulo}”, de ${formatarData(item.data)}.`,
      botao: "Excluir",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await excluirAnotacaoAction(item.id, membroId);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Anotação excluída.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" /> Histórico
            </CardTitle>
            <CardDescription>
              Mudanças de situação e documentos emitidos entram sozinhos. Anote aqui o que mais fizer parte da vida do
              membro na igreja.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setAberto(true)}>
            <Plus className="size-3.5" /> Anotar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ol className="flex flex-col gap-3 text-sm">
            {mostrados.map((item) => {
              const Icone = ICONE[item.tipo];
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.titulo}</span>
                    {item.detalhe ? <span className="block text-muted-foreground">{item.detalhe}</span> : null}
                    <span className="text-xs text-muted-foreground">{formatarData(item.data)}</span>
                  </span>
                  {item.tipo === "anotacao" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Excluir a anotação ${item.titulo}`}
                      onClick={() => excluir(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {itens.length > VISIVEIS ? (
          <button
            type="button"
            className="mt-3 text-sm font-medium text-primary hover:underline"
            onClick={() => setTudo((v) => !v)}
          >
            {tudo ? "Mostrar só os mais recentes" : `Ver tudo (${itens.length})`}
          </button>
        ) : null}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anotar no histórico de {nome}</DialogTitle>
            <DialogDescription>
              Ex.: consagrado a diácono, apresentado à igreja, voltou após afastamento. Mudança de situação é feita na
              ficha, e entra aqui sozinha.
            </DialogDescription>
          </DialogHeader>
          {aberto ? <AnotarForm membroId={membroId} hoje={hoje} onFeito={() => setAberto(false)} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AnotarForm({ membroId, hoje, onFeito }: { membroId: string; hoje: string; onFeito: () => void }) {
  const [state, action, pending] = useActionState(anotarHistoricoAction, undefined);
  useActionToast(state);
  // Fechar a janela é efeito do resultado da action (o diálogo é do pai).
  useEffect(() => {
    if (state?.success) onFeito();
  }, [state, onFeito]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="membroId" value={membroId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hist-titulo">O que aconteceu</Label>
        <Input id="hist-titulo" name="titulo" required minLength={2} maxLength={160} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hist-data">Quando</Label>
        <Input id="hist-data" name="data" type="date" required max={hoje} defaultValue={hoje} className="sm:w-48" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hist-detalhe">Detalhe (opcional)</Label>
        <Input id="hist-detalhe" name="detalhe" maxLength={500} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFeito} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Anotar"}
        </Button>
      </div>
    </form>
  );
}
