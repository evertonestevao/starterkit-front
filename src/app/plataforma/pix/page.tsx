import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PixReview } from "@/features/platform/components/pix-review";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { getPixModeracaoService } from "@/server/pixModeracao";

export const metadata: Metadata = { title: "Pix das igrejas" };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Chaves Pix aguardando conferência. A chave só aparece na página da igreja
 * depois de aprovada aqui: é a trava contra página falsa com Pix próprio e
 * contra conta invadida trocando a chave.
 *
 * A chave e o titular aparecem POR EXTENSO de propósito: quem modera precisa
 * ler e comparar com o nome da igreja.
 */
export default async function PlatformPixPage() {
  const pendentes = await (await getPixModeracaoService()).listPendentes();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pix das igrejas</h1>
        <p className="text-sm text-muted-foreground">
          Confira se o titular da chave é a própria igreja (ou alguém que responde por ela) antes de aprovar. Na dúvida,
          recuse com o motivo: a igreja corrige e envia de novo.
        </p>
      </div>

      {pendentes.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhuma chave aguardando" description="Quando uma igreja cadastrar ou trocar o Pix, ela aparece aqui." />
      ) : (
        <ul className="flex flex-col gap-3">
          {pendentes.map((p) => (
            <li key={p.churchId}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {p.churchName}
                    <Badge variant={p.paginaAtiva ? "secondary" : "outline"}>
                      {p.paginaAtiva ? "Página no ar" : "Página fora do ar"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Chave</dt>
                      <dd className="font-mono break-all">{p.pixChave}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Titular informado</dt>
                      <dd className="font-medium break-words">{p.pixTitular ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Endereço da igreja</dt>
                      <dd className="break-words">{p.address ?? "não informado"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Página</dt>
                      {/* Escrito por extenso, sem link: o endereço é dado da igreja, não nosso. */}
                      <dd className="font-mono break-all">{caminhoDaIgreja(p.publicCode)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Chave enviada em</dt>
                      <dd>{formatDateTime(p.enviadoEm)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Igreja cadastrada em</dt>
                      <dd>{formatDateTime(p.igrejaCriadaEm)}</dd>
                    </div>
                  </dl>
                  <PixReview churchId={p.churchId} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
