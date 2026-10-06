import type { Metadata } from "next";
import Link from "next/link";
import { Info, MapPin, Network, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChurchLinkRequestForm } from "@/features/church/components/church-link-request-form";
import { LINK_VISIBILITY_NOTES, churchLinkPath } from "@/lib/churchLinks";
import { nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import { getNomesNiveis } from "@/server/niveisRede";
import { formatChurchName } from "@/lib/churchName";
import { getChurchLinkService } from "@/server/churchLinks";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { canManageChurchLinks } from "@/services/churchLinkService";
import type { ChurchLinkInviteStatus, ChurchLinkPreview } from "@/types/churchLinks";

export const metadata: Metadata = {
  title: "Vínculo entre igrejas",
  // O caminho carrega o token do convite.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATUS_TEXT: Record<Exclude<ChurchLinkInviteStatus, "ativo">, string> = {
  revogado: "Quem enviou cancelou este link. Peça um novo.",
  expirado: "Este link expirou. Peça um novo a quem enviou.",
  esgotado: "Este link já recebeu o máximo de pedidos. Peça um novo a quem enviou.",
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function Resumo({ preview, nomes }: { preview: ChurchLinkPreview; nomes: NomesNiveis }) {
  const posicao = nomeNivel(nomes, preview.tipoSubordinada, { minusculo: true });
  const nome = formatChurchName(preview.church.name, preview.church.sobrenome);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-lg border p-3">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {nome}
          <Badge variant="secondary">{nomeNivel(nomes, preview.church.tipo)}</Badge>
        </p>
        {preview.church.address ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {preview.church.address}
          </p>
        ) : null}
        <Link
          href={`/igreja/${preview.church.publicCode}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-xs text-primary underline-offset-4 hover:underline"
        >
          Ver a página desta igreja
        </Link>
      </div>
      <p className="text-sm leading-6">
        <strong>{nome}</strong> convida a sua igreja para fazer parte da rede dela, como <strong>{posicao}</strong>.
      </p>
    </div>
  );
}

export default async function ChurchLinkInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { active } = await getActiveTenant();

  // Sem igreja, não há quem responda. O link continua valendo (30 dias).
  if (!active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vínculo entre igrejas</CardTitle>
          <CardDescription>Você recebeu um convite, mas ainda não tem uma igreja aqui.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>Cadastre a sua igreja primeiro e depois abra este mesmo link de novo.</p>
          <Link href={`/onboarding?next=${encodeURIComponent(churchLinkPath(token))}`} className="w-fit font-medium text-primary underline underline-offset-4">
            Cadastrar minha igreja
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (!data.user) return null;
  const actor = { companyId: active.id, role: active.role, userId: data.user.id };

  if (!canManageChurchLinks(active.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vínculo entre igrejas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Só quem administra a igreja pode responder a este convite. Peça ao pastor ou a um administrador que abra o link.
        </CardContent>
      </Card>
    );
  }

  const service = await getChurchLinkService();
  const preview = await service.previewInvite(token);

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link não encontrado</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Este link não existe ou foi digitado errado. Peça a quem enviou que gere um novo.
        </CardContent>
      </Card>
    );
  }
  // Os níveis aparecem com os nomes da rede de quem convidou.
  const nomes = await getNomesNiveis(preview.church.id);

  // Quem pode pedir: igrejas da empresa sem igreja-mãe (o banco confere de novo).
  const minhas = await service.listChurches(actor);
  const elegiveis = minhas.filter((c) => c.id !== preview.church.id && c.parentId === null);
  // O estado do pedido vem do banco: a página se atualiza depois de pedir.
  const pedidos = await service.myRequestsForInvite(actor, preview.inviteId);
  const pendente = pedidos.find((r) => r.status === "pendente");
  const aprovado = pedidos.find((r) => r.status === "aprovado");
  const recusado = pedidos.find((r) => r.status === "recusado");
  const nomeSuperior = formatChurchName(preview.church.name, preview.church.sobrenome);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="size-5 text-primary" aria-hidden />
          Vínculo entre igrejas
        </CardTitle>
        <CardDescription>Leia como funciona e decida se quer pedir o vínculo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Resumo preview={preview} nomes={nomes} />

        {preview.isMine ? (
          <Aviso>
            Este link é da sua igreja. Envie-o aos pastores das igrejas que você quer convidar para a sua rede: quando alguém
            pedir o vínculo, você aprova em Configurações → Vínculos.
          </Aviso>
        ) : pendente ? (
          <div className="flex flex-col gap-2">
            <Aviso>
              Pedido enviado. Aguardando a aprovação de {nomeSuperior}: você recebe um aviso e um e-mail com a resposta.
            </Aviso>
            <Link href="/dashboard/settings/vinculos" className="w-fit text-sm font-medium text-primary underline underline-offset-4">
              Ver vínculos no painel
            </Link>
          </div>
        ) : aprovado ? (
          <div className="flex flex-col gap-2">
            <Aviso>Vínculo aprovado. Sua igreja agora faz parte da rede de {nomeSuperior}.</Aviso>
            <Link href="/dashboard/settings/vinculos" className="w-fit text-sm font-medium text-primary underline underline-offset-4">
              Ver vínculos no painel
            </Link>
          </div>
        ) : preview.status !== "ativo" ? (
          <Aviso>{STATUS_TEXT[preview.status]}</Aviso>
        ) : elegiveis.length === 0 ? (
          <Aviso>
            Nenhuma das suas igrejas está livre para este vínculo: uma igreja só pode ter uma igreja-mãe. Se ela
            já faz parte de uma rede, desfaça esse vínculo em Configurações → Vínculos e abra o link de novo.
          </Aviso>
        ) : (
          <>
            {recusado ? (
              <Aviso>
                Seu pedido anterior não foi aprovado
                {recusado.motivoRecusa ? ` (motivo: ${recusado.motivoRecusa})` : ""}. Você pode pedir de novo.
              </Aviso>
            ) : null}
            <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                Como funciona
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-xs leading-5 text-muted-foreground">
                {LINK_VISIBILITY_NOTES.map((nota) => (
                  <li key={nota}>{nota}</li>
                ))}
              </ul>
            </div>
            <ChurchLinkRequestForm
              token={token}
              churches={elegiveis.map((c) => ({ id: c.id, name: c.name, sobrenome: c.sobrenome }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
