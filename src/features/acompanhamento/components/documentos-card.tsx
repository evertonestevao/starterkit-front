"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOCUMENTO_LABEL, aceitaDestino, exigeDestino } from "@/lib/documentosMembro";
import type { TipoDocumento } from "@/types/secretaria";

export interface DocumentoDisponivel {
  tipo: TipoDocumento;
  /** Dados que o modelo usa e a ficha não tem (viram "não informado" no papel). */
  faltando: string[];
}

/**
 * Documentos do membro: declaração, carta de recomendação e de transferência,
 * em PDF, assinados pelo Pastor. Antes de gerar, avisa o que falta na ficha.
 */
export function DocumentosCard({
  membroId,
  nome,
  documentos,
  temPastor,
  podeEditarModelos,
}: {
  membroId: string;
  nome: string;
  documentos: DocumentoDisponivel[];
  /** A igreja tem alguém com o cargo Pastor (é quem assina). */
  temPastor: boolean;
  podeEditarModelos: boolean;
}) {
  const [aberto, setAberto] = useState<DocumentoDisponivel | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-primary" /> Documentos
        </CardTitle>
        <CardDescription>
          Em PDF, com a assinatura do Pastor. Cada documento emitido fica no histórico do membro.
          {podeEditarModelos ? " O texto é ajustado em Configurações → Documentos." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {documentos.map((d) => (
          <Button key={d.tipo} type="button" variant="outline" size="sm" onClick={() => setAberto(d)}>
            {DOCUMENTO_LABEL[d.tipo]}
          </Button>
        ))}
      </CardContent>

      <Dialog open={aberto !== null} onOpenChange={(v) => (v ? null : setAberto(null))}>
        <DialogContent className="sm:max-w-md">
          {aberto ? (
            <Emitir
              membroId={membroId}
              nome={nome}
              documento={aberto}
              temPastor={temPastor}
              onFechar={() => setAberto(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Emitir({
  membroId,
  nome,
  documento,
  temPastor,
  onFechar,
}: {
  membroId: string;
  nome: string;
  documento: DocumentoDisponivel;
  temPastor: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const comDestino = aceitaDestino(documento.tipo);
  const obrigatorio = exigeDestino(documento.tipo);
  // "Igreja a quem a carta é endereçada" some do aviso assim que o destino é digitado.
  const faltando = documento.faltando.filter((f) => !(destino.trim() && f.startsWith("Igreja a quem")));
  const avisos = [...faltando, ...(temPastor ? [] : ["Nome do Pastor (defina quem tem o cargo Pastor em Membros)"])];

  return (
    <form
      className="flex flex-col gap-4"
      // GET numa aba nova: o PDF abre ao lado e a ficha continua aqui.
      action={`/dashboard/membros/${membroId}/documento`}
      method="get"
      target="_blank"
      onSubmit={() => {
        onFechar();
        // O documento emitido entra no histórico: recarrega a ficha para mostrar.
        setTimeout(() => router.refresh(), 1500);
      }}
    >
      <DialogHeader>
        <DialogTitle>{DOCUMENTO_LABEL[documento.tipo]}</DialogTitle>
        <DialogDescription>Para {nome}. O PDF abre em outra aba, pronto para imprimir.</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="tipo" value={documento.tipo} />

      {comDestino ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-destino">Igreja de destino{obrigatorio ? "" : " (opcional)"}</Label>
          <Input
            id="doc-destino"
            name="destino"
            required={obrigatorio}
            maxLength={160}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Ex.: Assembleia de Deus em Bauru"
            autoFocus
          />
        </div>
      ) : null}

      {avisos.length > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-medium">Faltam dados para este documento</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">
              No papel sai “não informado”. Você pode completar a ficha antes, ou gerar assim mesmo.
            </p>
          </div>
        </div>
      ) : null}

      {documento.tipo === "transferencia" ? (
        <p className="text-xs text-muted-foreground">
          Emitir a carta não muda a situação do membro. Depois de entregá-la, mude a situação para “Transferido” na
          ficha.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit">Gerar PDF</Button>
      </div>
    </form>
  );
}
