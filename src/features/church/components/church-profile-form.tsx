"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { caminhoDaIgreja, partesDaChave } from "@/lib/churchPaths";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelefoneInput } from "@/components/telefone-input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  saveChurchProfileAction,
  uploadChurchLogoAction,
} from "@/server/actions/churchProfile";
import type { ChurchProfile } from "@/services/churchProfileService";
import { ChurchAppearanceForm } from "./church-appearance-form";
import { SeletorDeIgreja } from "./seletor-de-igreja";

function rede(igreja: ChurchProfile, chave: string): string {
  return igreja.socialLinks?.[chave] ?? "";
}

/**
 * O que só existe na página pública da igreja: texto, endereço da página,
 * redes, logo e aparência. Nome e endereço da igreja ficam em Configurações →
 * Geral (ChurchDataForm).
 */
export function ChurchProfileForm({ igrejas, appUrl }: { igrejas: ChurchProfile[]; appUrl: string }) {
  const [state, formAction, pending] = useActionState(saveChurchProfileAction, undefined);
  useActionToast(state);
  const [logoState, logoAction, enviandoLogo] = useActionState(uploadChurchLogoAction, undefined);
  useActionToast(logoState);
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const igreja = igrejas.find((i) => i.id === churchId) ?? igrejas[0];
  const [publicCode, setPublicCode] = useState(igreja?.publicCode ?? "");

  if (!igreja) return <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>;

  const enderecoMudou = publicCode.trim().toLowerCase() !== igreja.publicCode;
  const base = appUrl.replace(/\/+$/, "");
  // Igreja abaixo de outra: o endereço leva o código da sede (a rede) na frente.
  const redeDaIgreja = partesDaChave(igreja.chavePublica).rede;

  // Os campos abaixo são não controlados (defaultValue): depois de salvar
  // com sucesso, o servidor devolve a igreja com os dados novos, e sem isto
  // o MESMO <input> já montado receberia um defaultValue diferente — o Base
  // UI reage com "changing the default value state of an uncontrolled
  // FieldControl after being initialized", e o Next mostra isso como um erro
  // em tela cheia. Uma key derivada de TODOS os valores que alimentam
  // defaultValue força a remontagem exatamente quando algum deles muda de
  // verdade (troca de igreja, ou um salvamento que persistiu algo novo) —
  // nunca enquanto a pessoa só está digitando, porque aí `igreja` ainda é o
  // valor antigo.
  const versaoDosCampos = [
    igreja.id,
    igreja.sobre ?? "",
    igreja.publicCode,
    rede(igreja, "instagram"),
    rede(igreja, "whatsapp"),
    rede(igreja, "youtube"),
    rede(igreja, "facebook"),
    rede(igreja, "site"),
  ].join("\u0000");

  function trocarIgreja(id: string) {
    const alvo = igrejas.find((i) => i.id === id);
    setChurchId(id);
    setPublicCode(alvo?.publicCode ?? "");
  }

  return (
    <div className="flex flex-col gap-6">
      {igrejas.length > 1 ? (
        <SeletorDeIgreja igrejas={igrejas} valor={churchId} aoTrocar={trocarIgreja} />
      ) : null}

      {/* key: remonta ao trocar de igreja OU quando um salvamento troca algum
          valor de verdade — ver o comentário de versaoDosCampos acima. */}
      <Formulario key={versaoDosCampos} action={formAction} estado={state} className="flex flex-col gap-4">
        <input type="hidden" name="churchId" value={igreja.id} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sobre">Sobre a igreja (opcional)</Label>
          <textarea
            id="sobre"
            name="sobre"
            // A `key` troca o texto quando a pessoa escolhe outra igreja na lista.
            key={igreja.id}
            defaultValue={igreja.sobre ?? ""}
            maxLength={1500}
            rows={5}
            placeholder="Conte em poucas linhas a história da igreja, quem é o pastor e o que vocês acreditam."
            className="min-h-28 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
          <p className="text-xs text-muted-foreground">Aparece na página pública, numa seção própria. Até 1.500 caracteres.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="publicCode">Endereço da página</Label>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-sm text-muted-foreground">
              {base}/igreja/{redeDaIgreja ? `${redeDaIgreja}/` : ""}
            </span>
            <Input
              id="publicCode"
              name="publicCode"
              required
              value={publicCode}
              onChange={(e) => setPublicCode(e.target.value)}
            />
          </div>
          {igreja.ehSedeDeRede ? (
            <p className="text-xs text-muted-foreground">
              Este é também o endereço da sua rede: as igrejas ligadas a você ficam em{" "}
              <strong className="font-medium text-foreground">
                {base}/igreja/{publicCode.trim().toLowerCase() || igreja.publicCode}/nome-da-igreja
              </strong>
              .
            </p>
          ) : null}
          {enderecoMudou ? (
            <Alert variant="destructive">
              <AlertDescription>
                {igreja.ehSedeDeRede
                  ? "Como sede, mudar este endereço muda também o de todas as igrejas ligadas à sua rede. "
                  : ""}
                Mudar o endereço quebra o QR Code e a tag NFC já impressos, e o link antigo para de
                funcionar. Se o material já foi produzido, é melhor manter{" "}
                <strong>{igreja.publicCode}</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <a
              href={`${base}${caminhoDaIgreja(igreja.chavePublica)}`}
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
              <TelefoneInput id="whatsapp" name="whatsapp" defaultValue={rede(igreja, "whatsapp")} />
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
      </Formulario>

      <Formulario action={logoAction} estado={logoState} className="flex flex-col gap-3 border-t pt-6">
        <input type="hidden" name="churchId" value={igreja.id} />

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
      </Formulario>

      {/* key: o estado do formulário nasce das props; troca de igreja ou um
          salvamento que mudou a escolha remonta com os valores novos. */}
      <ChurchAppearanceForm
        key={[igreja.id, igreja.appearanceMode, igreja.own.theme, igreja.own.accent ?? ""].join(" ")}
        igreja={igreja}
      />
    </div>
  );
}
