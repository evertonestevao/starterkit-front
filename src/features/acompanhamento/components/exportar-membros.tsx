"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FILTRO_SITUACAO_LABEL, type FiltroQuadro, type FiltroSituacao } from "@/lib/rolMembros";
import { selectClasses } from "./campos";

const SITUACOES: FiltroSituacao[] = ["ativo", "todas", "afastado", "transferido", "desligado", "falecido"];

/**
 * Exportar o rol: escolhe os filtros (começa com os da lista) e baixa em
 * planilha (com a ficha completa, para quem tem acesso a ela) ou em PDF para
 * imprimir. Os links apontam para o route handler, que confere o acesso.
 */
export function ExportarMembros({
  cargos,
  situacao: situacaoInicial,
  cargoId: cargoInicial,
}: {
  cargos: Array<{ id: string; nome: string }>;
  situacao: FiltroSituacao;
  cargoId: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [situacao, setSituacao] = useState<FiltroSituacao>(situacaoInicial);
  const [cargo, setCargo] = useState(cargoInicial);
  const [quadro, setQuadro] = useState<FiltroQuadro>("todos");

  const link = (formato: "csv" | "pdf") => {
    const qs = new URLSearchParams({ formato, situacao, quadro });
    if (cargo) qs.set("cargo", cargo);
    return `/dashboard/membros/exportar?${qs}`;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          // Sempre abre com os filtros que estão valendo na lista.
          setSituacao(situacaoInicial);
          setCargo(cargoInicial);
          setAberto(true);
        }}
      >
        <Download className="size-4" /> Exportar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar membros</DialogTitle>
            <DialogDescription>
              A planilha abre no Excel e traz a ficha completa de cada pessoa (para quem tem acesso a ela). O PDF é a
              lista para imprimir.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-situacao">Situação</Label>
              <select
                id="exp-situacao"
                className={selectClasses}
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}
              >
                {SITUACOES.map((s) => (
                  <option key={s} value={s}>
                    {FILTRO_SITUACAO_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-quadro">Quadro de membros</Label>
              <select
                id="exp-quadro"
                className={selectClasses}
                value={quadro}
                onChange={(e) => setQuadro(e.target.value as FiltroQuadro)}
              >
                <option value="todos">Todos (membros e não membros)</option>
                <option value="membros">Só quem faz parte do quadro</option>
                <option value="nao_membros">Só não membros (congregados, crianças)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-cargo">Cargo</Label>
              <select id="exp-cargo" className={selectClasses} value={cargo} onChange={(e) => setCargo(e.target.value)}>
                <option value="">Todos os cargos</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {/* <a download>: o arquivo baixa sem sair da tela. */}
              <a href={link("pdf")} download className={buttonVariants({ variant: "outline" })}>
                <FileText className="size-4" /> Baixar PDF
              </a>
              <a href={link("csv")} download className={buttonVariants()}>
                <FileSpreadsheet className="size-4" /> Baixar planilha
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              O arquivo tem dados pessoais dos membros: guarde e compartilhe com cuidado. A exportação fica registrada.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
