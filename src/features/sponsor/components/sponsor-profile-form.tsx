"use client";

import { useActionState, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { parseSponsorLink, sponsorLinkHref } from "@/lib/sponsorLink";
import { requestProfileChangeAction } from "@/server/actions/sponsorProfile";
import { SponsorLogoPreview } from "./sponsor-logo-preview";

/**
 * Edição do perfil do patrocinador.
 *
 * O nome não é salvo na hora: ele aparece nas páginas públicas das igrejas,
 * então vira pedido e só entra no ar depois da conferência da plataforma. O
 * telefone, que não aparece em lugar nenhum, salva direto. O formulário diz
 * isso em cada campo — descobrir depois que "salvou" não mudou nada seria
 * pior do que esperar sabendo.
 */
export function SponsorProfileForm({
  displayName,
  phone,
  logoUrl,
  pendingLogoUrl,
  linkInicial,
  bloqueada,
}: {
  displayName: string;
  phone: string | null;
  logoUrl: string | null;
  /** O logo já enviado que espera conferência; aparece mesmo sem aprovação. */
  pendingLogoUrl: string | null;
  /** O link aprovado hoje, já no formato de digitação (site ou telefone). */
  linkInicial: string;
  bloqueada: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestProfileChangeAction, undefined);
  useActionToast(state);
  const [linkDigitado, setLinkDigitado] = useState(linkInicial);
  const linkInterpretado = parseSponsorLink(linkDigitado);
  const destino =
    linkInterpretado.ok && linkInterpretado.link ? sponsorLinkHref(linkInterpretado.link) : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Nome exibido</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          minLength={2}
          maxLength={120}
          required
          disabled={bloqueada}
        />
        <p className="text-xs text-muted-foreground">
          É o nome que aparece nas páginas das igrejas que você apoia. Mudanças passam pela
          conferência da nossa equipe antes de entrar no ar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="logo">Logo</Label>
        <div className="flex items-center gap-3">
          <SponsorLogoPreview logoUrl={logoUrl} pendingLogoUrl={pendingLogoUrl} />
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={bloqueada}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG ou WebP, até 1 MB. Como o nome, o logo passa pela conferência antes de aparecer.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="link">Link da sua logo (opcional)</Label>
        <Input
          id="link"
          name="link"
          inputMode="url"
          autoComplete="off"
          value={linkDigitado}
          onChange={(event) => setLinkDigitado(event.target.value)}
          maxLength={300}
          placeholder="meusite.com.br ou (11) 91234-5678"
          aria-invalid={!linkInterpretado.ok}
          disabled={bloqueada}
        />
        {!linkInterpretado.ok ? (
          <p className="text-xs text-destructive">{linkInterpretado.message}</p>
        ) : destino ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-all">Quem clicar na sua logo vai abrir {destino}</span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Cole o endereço do seu site ou digite o número do seu WhatsApp — com o número, o link
          para conversar é criado sozinho. Deixe vazio para a logo não ser clicável. Passa pela
          conferência, como o nome e o logo.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Celular</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          placeholder="(11) 90000-0000"
        />
        <p className="text-xs text-muted-foreground">
          Usado só para falarmos com você. Não aparece para as igrejas, e salva na hora.
        </p>
      </div>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
