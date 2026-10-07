import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeloDocumentoForm } from "@/features/church/components/modelo-documento-form";
import { DOCUMENTO_LABEL } from "@/lib/documentosMembro";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";
import { canEditarModelos } from "@/services/secretariaService";

export const metadata: Metadata = { title: "Documentos" };

const PARA_QUE: Record<keyof typeof DOCUMENTO_LABEL, string> = {
  declaracao: "Comprova que a pessoa é membro da igreja (para escola, trabalho, outra denominação).",
  recomendacao: "Apresenta o membro a outra igreja que ele vai visitar, sem deixar de ser membro daqui.",
  transferencia: "Entrega o membro a outra igreja: ao recebê-la, ele passa a ser membro de lá.",
};

/**
 * Texto dos documentos da secretaria. Só quem administra a igreja altera; a
 * secretaria emite pela ficha do membro.
 */
export default async function DocumentosSettingsPage() {
  const actor = await getSecretariaActorAutorizado();
  // Member não chega aqui nem pela URL; o service e o banco recusam de novo.
  if (!actor || !canEditarModelos(actor.role)) notFound();

  const modelos = await (await getSecretariaService()).modelos(actor);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        O texto de cada documento emitido pela ficha do membro. Quem assina é quem tem o cargo Pastor na igreja.
      </p>
      {modelos.map((m) => (
        <Card key={m.tipo}>
          <CardHeader>
            <CardTitle>{DOCUMENTO_LABEL[m.tipo]}</CardTitle>
            <CardDescription>{PARA_QUE[m.tipo]}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* A chave muda quando o texto salvo muda: o formulário recomeça do que está no banco. */}
            <ModeloDocumentoForm key={`${m.origem}|${m.titulo}|${m.corpo}`} modelo={m} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
