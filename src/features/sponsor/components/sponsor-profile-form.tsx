"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { useActionToast } from "@/hooks/useActionToast";
import { parseSponsorLink, sponsorLinkHref } from "@/lib/sponsorLink";
import { requestProfileChangeAction } from "@/server/actions/sponsorProfile";
import { SponsorLogoPreview } from "./sponsor-logo-preview";

/**
 * Edição do perfil do patrocinador.
 *
 * O nome não é salvo na hora: ele aparece nas páginas públicas das igrejas,
 * então vira pedido e só entra no ar depois da conferência da plataforma. O
 * telefone, que não aparece em lugar nenhum, salva direto — assim como o
 * liga/desliga de aparecer na vitrine, que não é conteúdo (não dá pra
 * desfigurar nada com ele). O formulário diz isso em cada campo — descobrir
 * depois que "salvou" não mudou nada seria pior do que esperar sabendo.
 */
export function SponsorProfileForm({
  displayName,
  phone,
  logoUrl,
  pendingLogoUrl,
  linkInicial,
  bloqueada,
  visibleOnPage,
}: {
  displayName: string;
  phone: string | null;
  logoUrl: string | null;
  /** O logo já enviado que espera conferência; aparece mesmo sem aprovação. */
  pendingLogoUrl: string | null;
  /** O link aprovado hoje, já no formato de digitação (site ou telefone). */
  linkInicial: string;
  bloqueada: boolean;
  /** Se o patrocínio aparece na página pública da igreja. Padrão: aparece. */
  visibleOnPage: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestProfileChangeAction, undefined);
  useActionToast(state);
  const [linkDigitado, setLinkDigitado] = useState(linkInicial);
  const linkInterpretado = parseSponsorLink(linkDigitado);
  const destino =
    linkInterpretado.ok && linkInterpretado.link ? sponsorLinkHref(linkInterpretado.link) : null;

  // Pré-visualização local do arquivo escolhido, antes de qualquer envio —
  // só existe no navegador da pessoa. `object URL`, então precisa liberar a
  // anterior (e a última, ao desmontar) para não vazar memória.
  const [arquivoEscolhidoUrl, setArquivoEscolhidoUrl] = useState<string | null>(null);
  const urlAnteriorRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (urlAnteriorRef.current) URL.revokeObjectURL(urlAnteriorRef.current);
    };
  }, []);

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    if (urlAnteriorRef.current) URL.revokeObjectURL(urlAnteriorRef.current);
    const arquivo = event.target.files?.[0] ?? null;
    const url = arquivo ? URL.createObjectURL(arquivo) : null;
    urlAnteriorRef.current = url;
    setArquivoEscolhidoUrl(url);
  }

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-5">
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
          <SponsorLogoPreview
            logoUrl={logoUrl}
            pendingLogoUrl={pendingLogoUrl}
            selectedFileUrl={arquivoEscolhidoUrl}
          />
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleLogoChange}
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
        <TelefoneInput id="phone" name="phone" defaultValue={phone} />
        <p className="text-xs text-muted-foreground">
          Usado só para falarmos com você. Não aparece para as igrejas, e salva na hora.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="visibleOnPage"
          defaultChecked={visibleOnPage}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Aparecer na página da igreja
          <span className="block text-xs text-muted-foreground">
            Desmarcado, seu patrocínio continua valendo — só some da vitrine pública. Isso salva na
            hora, sem conferência.
          </span>
        </span>
      </label>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Formulario>
  );
}
