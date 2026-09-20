import type { Metadata } from "next";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerEnv } from "@/config/env";
import { ChurchHierarchyForm } from "@/features/platform/components/church-hierarchy-form";
import { churchTagUrl } from "@/lib/churchVisits";
import { getChurchHierarchyService } from "@/server/platform";
import { CHURCH_TIPO_LABEL } from "@/services/churchHierarchyService";

export const metadata: Metadata = { title: "Igrejas" };

/** Acima disso a tela pede um filtro em vez de desenhar centenas de formulários. */
const LIMITE = 60;

export default async function PlatformChurchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const service = await getChurchHierarchyService();
  const todas = await service.listTree();

  const termo = q.trim().toLowerCase();
  const filtradas = termo
    ? todas.filter((c) => c.name.toLowerCase().includes(termo) || c.publicCode.includes(termo))
    : todas;
  const visiveis = filtradas.slice(0, LIMITE);
  const appUrl = getServerEnv().APP_URL;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Igrejas</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Sede, subsedes e congregações. Quem está acima enxerga os dados de quem está abaixo, por
          isso só a plataforma liga uma igreja a outra. Ligar uma subsede à sede depois é só escolher
          a sede aqui — nenhum dado precisa ser migrado.
        </p>
      </div>

      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou código" aria-label="Buscar igreja" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={Network}
          title={termo ? "Nenhuma igreja encontrada" : "Nenhuma igreja ainda"}
          description="Igrejas entram pelo cadastro do pastor (onboarding) e aparecem aqui para serem ligadas."
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y p-0">
            {visiveis.map((church) => (
              <div
                key={church.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                // Recuo pela profundidade: a árvore se lê sem desenhar linhas.
                style={{ paddingLeft: `${1 + Math.min(church.depth, 3) * 1.25}rem` }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{church.name}</span>
                    <Badge variant="secondary">{CHURCH_TIPO_LABEL[church.tipo]}</Badge>
                    {!church.companyId ? <Badge variant="outline">demonstração</Badge> : null}
                  </div>
                  {/* Endereços que vão impressos: o ?origem= separa QR de NFC nas métricas. */}
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">
                    QR: {churchTagUrl(appUrl, church.publicCode, "qr")}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    NFC: {churchTagUrl(appUrl, church.publicCode, "nfc")}
                  </p>
                </div>
                <div className="w-full lg:max-w-xl">
                  <ChurchHierarchyForm church={church} all={todas} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {filtradas.length > LIMITE ? (
        <p className="text-sm text-muted-foreground">
          Mostrando {LIMITE} de {filtradas.length}. Use a busca para achar uma igreja específica.
        </p>
      ) : null}
    </div>
  );
}
