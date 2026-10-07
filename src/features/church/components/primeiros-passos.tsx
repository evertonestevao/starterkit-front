import Link from "next/link";
import { CheckCircle2, Circle, Clock3, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { PIX_STATUS_LABEL, explicarPixStatus, type PixStatus } from "@/lib/pixStatus";
import { PaginaNoAr } from "./pagina-no-ar";

export interface PrimeirosPassosDados {
  churchId: string;
  /** A chave completa da página ("sede~codigo"), para o link de prévia. */
  chavePublica: string;
  temEndereco: boolean;
  paginaAtiva: boolean;
  pix: PixStatus;
  pixMotivoRecusa: string | null;
}

/** O cartão some quando não há mais nada para a igreja fazer ou acompanhar. */
export function temPrimeirosPassos(d: PrimeirosPassosDados): boolean {
  return !d.paginaAtiva || d.pix === "aguardando" || d.pix === "recusado";
}

/**
 * Primeiros passos de uma igreja nova, no Painel de quem administra: completar
 * a página, colocá-la no ar e (opcional) cadastrar o Pix, que passa por
 * conferência antes de aparecer.
 */
export function PrimeirosPassos({ dados }: { dados: PrimeirosPassosDados }) {
  const pixFeito = dados.pix === "aprovado";
  const IconePix = pixFeito
    ? CheckCircle2
    : dados.pix === "aguardando"
      ? Clock3
      : dados.pix === "recusado"
        ? TriangleAlert
        : Circle;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Primeiros passos</CardTitle>
        <CardDescription>
          {dados.paginaAtiva
            ? "Sua página já está no ar. Falta só acompanhar a conferência do Pix."
            : "A página da sua igreja ainda está fora do ar: só aparece para o público depois que você a publicar."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y text-sm">
          <Passo feito={dados.temEndereco} titulo="1. Complete os dados da página">
            <p className="text-muted-foreground">
              Endereço, logo, redes sociais e o texto &quot;Sobre a igreja&quot;.{" "}
              <Link href="/dashboard/settings/igreja" className="font-medium text-primary underline underline-offset-4">
                Abrir a página da igreja
              </Link>
            </p>
          </Passo>
          <Passo feito={dados.paginaAtiva} titulo="2. Coloque a página no ar">
            <p className="mb-2 text-muted-foreground">
              {dados.paginaAtiva
                ? "A página está no ar: o link, o QR Code e a tag já funcionam."
                : "Enquanto está fora do ar, só você vê a página (em prévia). Publique quando estiver pronta."}
            </p>
            <PaginaNoAr
              churchId={dados.churchId}
              ativa={dados.paginaAtiva}
              paginaUrl={caminhoDaIgreja(dados.chavePublica)}
            />
          </Passo>
          <li className="flex gap-3 py-3">
            <IconePix
              className={`mt-0.5 size-5 shrink-0 ${pixFeito ? "text-primary" : dados.pix === "recusado" ? "text-destructive" : "text-muted-foreground"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                3. Pix para dízimos e ofertas{" "}
                <span className="font-normal text-muted-foreground">· {PIX_STATUS_LABEL[dados.pix]}</span>
              </p>
              <p className="text-muted-foreground">
                {explicarPixStatus(dados.pix, dados.pixMotivoRecusa)}{" "}
                <Link href="/dashboard/settings/pix" className="font-medium text-primary underline underline-offset-4">
                  {dados.pix === "sem_chave" ? "Cadastrar o Pix" : "Abrir o Pix"}
                </Link>
              </p>
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

function Passo({ feito, titulo, children }: { feito: boolean; titulo: string; children: React.ReactNode }) {
  const Icone = feito ? CheckCircle2 : Circle;
  return (
    <li className="flex gap-3 py-3">
      <Icone className={`mt-0.5 size-5 shrink-0 ${feito ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        {children}
      </div>
    </li>
  );
}
