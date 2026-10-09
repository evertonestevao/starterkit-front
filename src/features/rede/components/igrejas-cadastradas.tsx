import { Clock, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/acompanhamento";
import { formatChurchName } from "@/lib/churchName";
import { nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import type { IgrejaAguardando } from "@/services/redeCadastroService";
import { CadastrarIgrejaForm } from "./cadastrar-igreja-form";
import { ConvidarResponsavelForm } from "./convidar-responsavel-form";
import { EditarAguardandoForm } from "./editar-aguardando-form";

/**
 * Cadastrar as igrejas de baixo e acompanhar as que ainda aguardam alguém
 * assumir. Só para quem tem "Cadastrar igrejas na rede" nesta igreja.
 */
export function IgrejasCadastradas({
  maeId,
  nomeDaMae,
  podeSubsede,
  aguardando,
  nomes,
}: {
  maeId: string;
  nomeDaMae: string;
  podeSubsede: boolean;
  aguardando: IgrejaAguardando[];
  nomes: NomesNiveis;
}) {
  const hoje = new Date().toISOString();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="size-4" /> Cadastrar igrejas da rede
        </CardTitle>
        <CardDescription>
          Cadastre {podeSubsede ? "subsedes e congregações" : "congregações"} abaixo desta igreja e convide quem vai
          assumir cada uma. Você não vira responsável por elas: depois que a pessoa assume, os dados são dela.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CadastrarIgrejaForm maeId={maeId} nomeSugerido={nomeDaMae} podeSubsede={podeSubsede} />

        {aguardando.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Aguardando responsável ({aguardando.length})</p>
            <ul className="flex flex-col gap-2">
              {aguardando.map((ig) => {
                const vencido = ig.convite ? ig.convite.expiraEm < hoje : false;
                return (
                  <li key={ig.churchId} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatChurchName(ig.nome, ig.sobrenome)}</span>
                      <Badge variant="secondary">{nomeNivel(nomes, ig.tipo)}</Badge>
                      <Badge variant="outline" className="gap-1">
                        <Clock className="size-3" /> Aguardando responsável
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ig.convite
                        ? `${vencido ? "Convite vencido" : "Convite enviado"} para ${ig.convite.nome} (${ig.convite.email}) · ${
                            vencido ? "venceu" : "vale até"
                          } ${formatarData(ig.convite.expiraEm.slice(0, 10))}`
                        : "Ninguém convidado ainda."}
                    </p>
                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        {ig.convite ? "Gerar convite novo" : "Convidar quem vai assumir"}
                      </summary>
                      <div className="mt-3">
                        {ig.convite ? (
                          <p className="mb-2 text-xs text-muted-foreground">
                            Gerar um convite novo cancela o anterior (o link antigo deixa de funcionar).
                          </p>
                        ) : null}
                        <ConvidarResponsavelForm churchId={ig.churchId} igreja={formatChurchName(ig.nome, ig.sobrenome)} />
                      </div>
                    </details>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-primary">Preparar a página</summary>
                      <div className="mt-3">
                        <EditarAguardandoForm igreja={ig} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
