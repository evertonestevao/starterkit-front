import type { Metadata } from "next";
import Link from "next/link";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerEnv } from "@/config/env";
import { ChurchHierarchyForm } from "@/features/platform/components/church-hierarchy-form";
import { MensalidadeForm } from "@/features/platform/components/mensalidade-form";
import { churchTagUrl } from "@/lib/churchVisits";
import { paginaDaUrl, paginar } from "@/lib/paginacao";
import { exigePlatformStaff, getChurchHierarchyService, getMensalidadeService } from "@/server/platform";
import { formatCents } from "@/services/sponsorPricing";
import { CHURCH_TIPO_LABEL } from "@/services/churchHierarchyService";

export const metadata: Metadata = { title: "Igrejas" };

/** Igrejas por página: cada linha carrega um formulário, então a página é curta. */
const POR_PAGINA = 30;

export default async function PlatformChurchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await exigePlatformStaff();
  const { q = "", page } = await searchParams;
  const service = await getChurchHierarchyService();
  const todas = await service.listTree();
  // Mensalidade de cada igreja. É um complemento: se falhar, a lista segue sem ele.
  const mensalidades = new Map(
    (
      await (await getMensalidadeService()).listar().catch((err: unknown) => {
        console.error("[plataforma] falha ao carregar as mensalidades", err);
        return [];
      })
    ).map((m) => [m.churchId, m]),
  );

  const termo = q.trim().toLowerCase();
  const filtradas = termo
    ? todas.filter(
        (c) =>
          c.name.toLowerCase().includes(termo) ||
          c.publicCode.includes(termo) ||
          (c.redeNome?.toLowerCase().includes(termo) ?? false),
      )
    : todas;
  const pag = paginar(filtradas, paginaDaUrl(page), POR_PAGINA);
  const visiveis = pag.itens;
  const appUrl = getServerEnv().APP_URL;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Igrejas</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Sede, subsedes e congregações. Quem está acima enxerga os dados de quem está abaixo, por isso só a plataforma
          liga uma igreja a outra. Ligar uma subsede à sede depois é só escolher a sede aqui — nenhum dado precisa ser
          migrado.
        </p>
      </div>

      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, código ou rede" aria-label="Buscar igreja" />
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
                    {/* Igreja recém-criada pelo onboarding: nasce como subsede
                        solta, vendo só a si mesma, até a plataforma colocá-la
                        no lugar certo da árvore. */}
                    {church.tipo === "subsede" && !church.parentId ? (
                      <Badge variant="outline">hierarquia a definir</Badge>
                    ) : null}
                    {/* Rede declarada no cadastro: clicar busca as irmãs da mesma rede. */}
                    {church.redeNome ? (
                      <Link href={`?q=${encodeURIComponent(church.redeNome)}`} title="Ver igrejas desta rede">
                        <Badge variant="outline">Rede: {church.redeNome}</Badge>
                      </Link>
                    ) : church.fazParteDeRede ? (
                      <Badge variant="outline">rede (sem nome)</Badge>
                    ) : null}
                  </div>
                  {/* Endereços que vão impressos: o ?origem= separa QR de NFC nas métricas. */}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">QR Code e tag NFC</summary>
                    <div className="mt-2 flex flex-col gap-2 rounded-lg border p-3">
                      <div>
                        <p className="text-xs font-medium">Endereço do QR impresso</p>
                        <p className="break-all text-xs text-muted-foreground">
                          {churchTagUrl(appUrl, church.publicCode, "qr")}
                        </p>
                        <p className="mt-1 flex gap-3 text-xs">
                          <a
                            className="text-primary hover:underline"
                            href={`/plataforma/igrejas/${church.id}/qr?formato=png&origem=qr`}
                          >
                            Baixar PNG
                          </a>
                          <a
                            className="text-primary hover:underline"
                            href={`/plataforma/igrejas/${church.id}/qr?formato=svg&origem=qr`}
                          >
                            Baixar SVG
                          </a>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium">Endereço para gravar na tag NFC</p>
                        <p className="break-all text-xs text-muted-foreground select-all">
                          {churchTagUrl(appUrl, church.publicCode, "nfc")}
                        </p>
                        <p className="mt-1 flex gap-3 text-xs">
                          <a
                            className="text-primary hover:underline"
                            href={`/plataforma/igrejas/${church.id}/qr?formato=png&origem=nfc`}
                          >
                            Baixar PNG
                          </a>
                          <a
                            className="text-primary hover:underline"
                            href={`/plataforma/igrejas/${church.id}/qr?formato=svg&origem=nfc`}
                          >
                            Baixar SVG
                          </a>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        SVG para impressão grande (não perde nitidez); PNG para uso rápido.
                      </p>
                    </div>
                  </details>
                  {mensalidades.has(church.id) ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Mensalidade:{" "}
                        {formatCents(
                          mensalidades.get(church.id)!.valorProprioCents ??
                            mensalidades.get(church.id)!.valorPadraoCents,
                        )}
                        {mensalidades.get(church.id)!.valorProprioCents !== null ? " (valor próprio)" : ""}
                        {mensalidades.get(church.id)!.pagando ? " · pagando" : ""}
                      </summary>
                      <MensalidadeForm
                        // A chave muda com o valor gravado: o formulário recomeça do que está no banco.
                        key={String(mensalidades.get(church.id)!.valorProprioCents)}
                        churchId={church.id}
                        valorProprioCents={mensalidades.get(church.id)!.valorProprioCents}
                        motivo={mensalidades.get(church.id)!.motivo}
                        valorPadraoCents={mensalidades.get(church.id)!.valorPadraoCents}
                        pagando={mensalidades.get(church.id)!.pagando}
                      />
                    </details>
                  ) : null}
                </div>
                <div className="w-full lg:max-w-xl">
                  <ChurchHierarchyForm church={church} all={todas} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <PaginationControls
        page={pag.pagina}
        pageSize={POR_PAGINA}
        total={pag.total}
        basePath="/plataforma/igrejas"
        params={{ q: q || undefined }}
      />
    </div>
  );
}
