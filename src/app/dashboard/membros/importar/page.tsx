import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportarMembros } from "@/features/acompanhamento/components/importar-membros";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Importar membros" };

/**
 * Importar membros de uma planilha. O acesso é o mesmo de Membros (o layout
 * da seção já barrou quem não pode); o service valida cada linha de novo.
 */
export default async function ImportarMembrosPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  // Nome e nascimento de quem a igreja já tem: a tela avisa os possíveis
  // repetidos antes de gravar (o service confere de novo ao importar).
  const cadastrados = await (await getAcompanhamentoService()).pessoasParaConferir(actor);

  return (
    <div className="flex flex-col gap-3">
      <Link href="/dashboard/membros" className="text-xs text-muted-foreground hover:underline">
        ← Membros
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Importar membros de uma planilha</CardTitle>
          <CardDescription>
            Para trazer de uma vez a lista que a igreja já tem no Excel ou no Google Planilhas. Nada é gravado antes de
            você conferir e confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportarMembros cadastrados={cadastrados} />
        </CardContent>
      </Card>
    </div>
  );
}
