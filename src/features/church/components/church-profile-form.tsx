"use client";

import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveChurchProfileAction,
  uploadChurchLogoAction,
} from "@/server/actions/churchProfile";
import type { ChurchProfile } from "@/services/churchProfileService";

const selectClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function rede(igreja: ChurchProfile, chave: string): string {
  return igreja.socialLinks?.[chave] ?? "";
}

/**
 * Tudo o que aparece na página pública da igreja, no lugar onde quem cuida
 * dela consegue mexer. Antes isso só entrava por SQL.
 */
export function ChurchProfileForm({ igrejas, appUrl }: { igrejas: ChurchProfile[]; appUrl: string }) {
  const [state, formAction, pending] = useActionState(saveChurchProfileAction, undefined);
  const [logoState, logoAction, enviandoLogo] = useActionState(uploadChurchLogoAction, undefined);
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const igreja = igrejas.find((i) => i.id === churchId) ?? igrejas[0];
  const [publicCode, setPublicCode] = useState(igreja?.publicCode ?? "");

  if (!igreja) return <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>;

  const enderecoMudou = publicCode.trim().toLowerCase() !== igreja.publicCode;
  const base = appUrl.replace(/\/+$/, "");

  function trocarIgreja(id: string) {
    const alvo = igrejas.find((i) => i.id === id);
    setChurchId(id);
    setPublicCode(alvo?.publicCode ?? "");
  }

  return (
    <div className="flex flex-col gap-6">
      {igrejas.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igreja">Igreja</Label>
          <select
            id="igreja"
            className={selectClasses}
            value={churchId}
            onChange={(e) => trocarIgreja(e.target.value)}
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* key: trocar de igreja recria o formulário com os valores dela. */}
      <form key={igreja.id} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="churchId" value={igreja.id} />

        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state?.success ? (
          <Alert>
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome da igreja</Label>
          <Input id="name" name="name" required defaultValue={igreja.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Endereço</Label>
          <Input
            id="address"
            name="address"
            defaultValue={igreja.address ?? ""}
            placeholder="Rua das Flores, 540 - Centro, Lins/SP"
          />
          <p className="text-xs text-muted-foreground">
            É com ele que a página monta o “Como chegar”.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="publicCode">Endereço da página</Label>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-sm text-muted-foreground">{base}/igreja/</span>
            <Input
              id="publicCode"
              name="publicCode"
              required
              value={publicCode}
              onChange={(e) => setPublicCode(e.target.value)}
            />
          </div>
          {enderecoMudou ? (
            <Alert variant="destructive">
              <AlertDescription>
                Mudar o endereço quebra o QR Code e a tag NFC já impressos, e o link antigo para de
                funcionar. Se o material já foi produzido, é melhor manter{" "}
                <strong>{igreja.publicCode}</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <a
              href={`${base}/igreja/${igreja.publicCode}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver a página <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Onde a comunidade encontra vocês</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                name="instagram"
                defaultValue={rede(igreja, "instagram")}
                placeholder="@suaigreja"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={rede(igreja, "whatsapp")}
                placeholder="14999998888"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="youtube">YouTube</Label>
              <Input
                id="youtube"
                name="youtube"
                defaultValue={rede(igreja, "youtube")}
                placeholder="https://youtube.com/@suaigreja"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                name="facebook"
                defaultValue={rede(igreja, "facebook")}
                placeholder="https://facebook.com/suaigreja"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="site">Site</Label>
              <Input
                id="site"
                name="site"
                defaultValue={rede(igreja, "site")}
                placeholder="https://suaigreja.org.br"
              />
            </div>
          </div>
        </fieldset>

        <div>
          <Button type="submit" disabled={pending}>
            Salvar página
          </Button>
        </div>
      </form>

      <form action={logoAction} className="flex flex-col gap-3 border-t pt-6">
        <input type="hidden" name="churchId" value={igreja.id} />
        {logoState?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{logoState.error}</AlertDescription>
          </Alert>
        ) : null}
        {logoState?.success ? (
          <Alert>
            <AlertDescription>{logoState.success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center gap-4">
          {igreja.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={igreja.logoUrl}
              alt={`Logo de ${igreja.name}`}
              className="size-14 rounded-lg border bg-white object-contain"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
              sem logo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="logo">Logo (JPG, PNG ou WebP, até 1MB)</Label>
            <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" required />
          </div>
        </div>

        <div>
          <Button type="submit" variant="outline" disabled={enviandoLogo}>
            {enviandoLogo ? "Enviando..." : "Enviar logo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
