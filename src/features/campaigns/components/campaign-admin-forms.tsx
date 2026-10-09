"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { paginar } from "@/lib/paginacao";
import { useMoneyInput } from "@/hooks/useMoneyInput";
import { GATEWAY_FEE_HINT, PIX_HINT } from "@/features/campaigns/paymentMethodCopy";
import {
  activateCampaignAction,
  closeCampaignAction,
  confirmPixDonationAction,
  removeCampaignAction,
  setCampaignFeedbackAction,
  updateCampaignAction,
  uploadCampaignCoverAction,
  uploadCampaignFeedbackPhotoAction,
} from "@/server/actions/campaigns";
import { formatCents } from "@/services/sponsorPricing";
import type { CampaignDonationRow, CompanyCampaign } from "@/services/campaignsService";

/** Edição dos dados da campanha — os mesmos campos da criação, sem a igreja. */
export function EditCampaignForm({ campanha }: { campanha: CompanyCampaign }) {
  const [state, formAction, pending] = useActionState(updateCampaignAction, undefined);
  useActionToast(state);

  const indicePadrao = campanha.valorPadraoCents
    ? String(campanha.valoresSugeridos.indexOf(campanha.valorPadraoCents) + 1)
    : "";
  const meta = useMoneyInput(campanha.metaCents);
  const sugerido1 = useMoneyInput(campanha.valoresSugeridos[0]);
  const sugerido2 = useMoneyInput(campanha.valoresSugeridos[1]);
  const sugerido3 = useMoneyInput(campanha.valoresSugeridos[2]);
  const sugeridos = [sugerido1, sugerido2, sugerido3];

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-5">
      <input type="hidden" name="campaignId" value={campanha.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" required minLength={2} maxLength={120} defaultValue={campanha.titulo} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="historia">História do projeto</Label>
        <textarea
          id="historia"
          name="historia"
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          defaultValue={campanha.historia}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="meta">Meta (total a arrecadar)</Label>
        <Input
          id="meta"
          name="meta"
          required
          inputMode="decimal"
          maxLength={20}
          className="sm:max-w-56"
          value={meta.value}
          onChange={meta.onChange}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Como vai receber as ofertas</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="metodoRecebimento"
            value="pix"
            defaultChecked={campanha.metodoRecebimento === "pix"}
            required
            className="mt-0.5"
          />
          <span>
            PIX direto
            <span className="block text-xs text-muted-foreground">{PIX_HINT}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="metodoRecebimento"
            value="gateway"
            defaultChecked={campanha.metodoRecebimento === "gateway"}
            required
            className="mt-0.5"
          />
          <span>
            Cartão ou Pix automático
            <span className="block text-xs text-muted-foreground">{GATEWAY_FEE_HINT}</span>
          </span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="mostrarProgresso"
          defaultChecked={campanha.mostrarProgresso}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Mostrar barra de progresso na página
          <span className="block text-xs text-muted-foreground">Some com o total já arrecadado.</span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Valores sugeridos <span className="font-normal text-muted-foreground">(opcional, até 3)</span>
        </legend>
        <p className="text-xs text-muted-foreground">
          Preencha os que quiser — cada um vira um botão de valor na página. Nenhum precisa vir marcado como &ldquo;vem
          selecionado&rdquo;; é só um atalho opcional para quem doa não precisar escolher.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Label htmlFor={`valorSugerido${i}`} className="text-xs text-muted-foreground">
                Valor {i}
              </Label>
              <Input
                id={`valorSugerido${i}`}
                name={`valorSugerido${i}`}
                inputMode="decimal"
                maxLength={20}
                value={sugeridos[i - 1].value}
                onChange={sugeridos[i - 1].onChange}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="radio"
                  name="valorPadraoIndice"
                  value={String(i)}
                  defaultChecked={indicePadrao === String(i)}
                  className="size-3.5"
                />
                Vem selecionado na página
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="permitirValorLivre"
          defaultChecked={campanha.permitirValorLivre}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>Permitir que a pessoa digite outro valor</span>
      </label>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </Formulario>
  );
}

/** Ativar (publica na página) ou encerrar (para de receber, mantém o resultado). */
export function CampaignStatusActions({ campanha }: { campanha: CompanyCampaign }) {
  const [activateState, activateAction, activating] = useActionState(activateCampaignAction, undefined);
  useActionToast(activateState);
  const [closeState, closeAction, closing] = useActionState(closeCampaignAction, undefined);
  useActionToast(closeState);
  const [removeState, removeAction, removing] = useActionState(removeCampaignAction, undefined);
  useActionToast(removeState);

  return (
    <div className="flex flex-wrap gap-2">
      {campanha.status === "rascunho" ? (
        <Formulario action={activateAction} estado={activateState}>
          <input type="hidden" name="campaignId" value={campanha.id} />
          <Button type="submit" disabled={activating}>
            {activating ? "Ativando..." : "Ativar e publicar"}
          </Button>
        </Formulario>
      ) : null}

      {campanha.status === "ativa" ? (
        <Formulario action={closeAction} estado={closeState}>
          <input type="hidden" name="campaignId" value={campanha.id} />
          <Button type="submit" variant="outline" disabled={closing}>
            {closing ? "Encerrando..." : "Encerrar campanha"}
          </Button>
        </Formulario>
      ) : null}

      {campanha.status === "rascunho" ? (
        <Formulario action={removeAction} estado={removeState}>
          <input type="hidden" name="campaignId" value={campanha.id} />
          <Button type="submit" variant="ghost" className="gap-1.5 text-destructive" disabled={removing}>
            <Trash2 className="size-3.5" aria-hidden />
            Remover
          </Button>
        </Formulario>
      ) : null}
    </div>
  );
}

function CoverPreview({ url, titulo }: { url: string | null; titulo: string }) {
  if (!url) {
    return (
      <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
        sem capa
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- capa em storage externo
    <img src={url} alt={`Capa de ${titulo}`} className="h-24 w-40 shrink-0 rounded-lg border object-cover" />
  );
}

export function CampaignCoverForm({ campanha }: { campanha: CompanyCampaign }) {
  const [state, formAction, pending] = useActionState(uploadCampaignCoverAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="campaignId" value={campanha.id} />
      <div className="flex items-center gap-4">
        <CoverPreview url={campanha.fotoCapaUrl} titulo={campanha.titulo} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="capa">Foto de capa (JPG, PNG ou WebP, até 1MB)</Label>
          <Input id="capa" name="capa" type="file" accept="image/jpeg,image/png,image/webp" required />
        </div>
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Enviando..." : "Enviar capa"}
        </Button>
      </div>
    </Formulario>
  );
}

/** Devolutiva: só habilitada depois de encerrar (regra do service). */
export function CampaignFeedbackForm({ campanha }: { campanha: CompanyCampaign }) {
  const [textoState, textoAction, salvandoTexto] = useActionState(setCampaignFeedbackAction, undefined);
  useActionToast(textoState);
  const [fotoState, fotoAction, enviandoFoto] = useActionState(uploadCampaignFeedbackPhotoAction, undefined);
  useActionToast(fotoState);

  if (campanha.status !== "encerrada") {
    return <p className="text-sm text-muted-foreground">A devolutiva fica disponível depois de encerrar a campanha.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <Formulario action={textoAction} estado={textoState} className="flex flex-col gap-3">
        <input type="hidden" name="campaignId" value={campanha.id} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="feedbackTexto">
            O que foi feito <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <textarea
            id="feedbackTexto"
            name="feedbackTexto"
            maxLength={4000}
            rows={5}
            defaultValue={campanha.feedbackTexto ?? ""}
            placeholder="Conte para quem doou o que foi feito com o dinheiro arrecadado."
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div>
          <Button type="submit" variant="outline" disabled={salvandoTexto}>
            {salvandoTexto ? "Salvando..." : "Salvar texto"}
          </Button>
        </div>
      </Formulario>

      <Formulario action={fotoAction} estado={fotoState} className="flex flex-col gap-3 border-t pt-5">
        <input type="hidden" name="campaignId" value={campanha.id} />
        <div className="flex items-center gap-4">
          <CoverPreview url={campanha.feedbackFotoUrl} titulo={`devolutiva de ${campanha.titulo}`} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedbackFoto">
              Foto da devolutiva <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="feedbackFoto"
              name="feedbackFoto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </div>
        </div>
        <div>
          <Button type="submit" variant="outline" disabled={enviandoFoto}>
            {enviandoFoto ? "Enviando..." : "Enviar foto"}
          </Button>
        </div>
      </Formulario>
    </div>
  );
}

const STATUS_DOACAO: Record<CampaignDonationRow["status"], string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  recusada: "Recusada",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function ConfirmPixDonationButton({
  campaignId,
  donationId,
  nome,
}: {
  campaignId: string;
  donationId: string;
  nome: string;
}) {
  const [state, formAction, pending] = useActionState(confirmPixDonationAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="donationId" value={donationId} />
      <Button type="submit" size="sm" disabled={pending} aria-label={`Confirmar doação de ${nome}`}>
        {pending ? "Confirmando..." : "Confirmar"}
      </Button>
    </Formulario>
  );
}

/**
 * Doações da campanha. PIX pendente ganha o botão de confirmar (a equipe
 * financeira conferiu o extrato ou o comprovante); cartão nunca aparece
 * pendente por muito tempo — confirma sozinho, no webhook.
 */
/** Doações do histórico por página. */
const DOACOES_POR_PAGINA = 20;

export function CampaignDonationsList({ campaignId, doacoes }: { campaignId: string; doacoes: CampaignDonationRow[] }) {
  const [pagina, setPagina] = useState(1);
  if (doacoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma doação ainda.</p>;
  }

  const pendentes = doacoes.filter((d) => d.status === "pendente");
  const resto = doacoes.filter((d) => d.status !== "pendente");
  // As pendentes ficam todas à vista (pedem ação); o histórico é que cresce.
  const historico = paginar(resto, pagina, DOACOES_POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      {pendentes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Pendentes de confirmação</p>
          <ul className="flex flex-col divide-y rounded-lg border">
            {pendentes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.doadorNome}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(d.valorBrutoCents)} · {d.doadorTelefone ?? "sem telefone"} ·{" "}
                    {formatDateTime(d.createdAt)}
                  </p>
                </div>
                <ConfirmPixDonationButton campaignId={campaignId} donationId={d.id} nome={d.doadorNome} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {resto.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Histórico</p>
          <ul className="flex flex-col divide-y rounded-lg border">
            {historico.itens.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.doadorNome}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(d.valorLiquidoCents ?? d.valorBrutoCents)} · {d.metodo === "pix" ? "PIX" : "Cartão"} ·{" "}
                    {formatDateTime(d.createdAt)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{STATUS_DOACAO[d.status]}</span>
              </li>
            ))}
          </ul>
          <PaginacaoLocal
            pagina={historico.pagina}
            totalPaginas={historico.totalPaginas}
            total={historico.total}
            onMudar={setPagina}
            rotulo="doação"
            rotuloPlural="doações"
          />
        </div>
      ) : null}
    </div>
  );
}
