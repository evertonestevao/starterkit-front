"use client";

import { Formulario } from "@/components/formulario";
import { useActionToast } from "@/hooks/useActionToast";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { CopyPix } from "@/features/church/components/copy-pix";
import { CamposAntiRobo } from "@/components/campos-anti-robo";
import { TelefoneInput } from "@/components/telefone-input";
import { campo, rotulo } from "@/features/church/components/public-actions";
import {
  submitGatewayCampaignDonationAction,
  submitPixCampaignDonationAction,
} from "@/server/actions/publicCampaigns";
import { formatCents } from "@/services/sponsorPricing";

function Enviar({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 h-12 w-full rounded-xl bg-[var(--pg-accent)] text-base font-semibold text-[var(--pg-accent-fg)] transition-opacity disabled:opacity-60"
    >
      {pending ? "Enviando..." : children}
    </button>
  );
}

/**
 * Chips com os valores sugeridos + campo livre (quando a campanha permite).
 * Sem nenhum sugerido, ou sem permitir valor livre com todos sem marcar, cai
 * sempre no campo livre — nunca deixa a pessoa sem como digitar um valor.
 */
function SeletorDeValor({
  valoresSugeridos,
  valorPadraoCents,
  permitirValorLivre,
  valor,
  onChange,
}: {
  valoresSugeridos: number[];
  valorPadraoCents: number | null;
  permitirValorLivre: boolean;
  valor: string;
  onChange: (texto: string) => void;
}) {
  const mostrarLivre = permitirValorLivre || valoresSugeridos.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <span className={rotulo}>Valor da doação</span>
      {valoresSugeridos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {valoresSugeridos.map((v) => {
            const texto = formatCents(v);
            const selecionado = valor === texto;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onChange(texto)}
                className={`h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                  selecionado
                    ? "border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-fg)]"
                    : "border-[var(--pg-border)] bg-[var(--pg-surface-2)] text-[var(--pg-text)]"
                }`}
              >
                {formatCents(v)}
                {v === valorPadraoCents ? <span className="sr-only"> (sugestão)</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {mostrarLivre ? (
        <input
          name="valor"
          inputMode="decimal"
          required
          value={valor}
          onChange={(e) => {
            // Máscara: cada dígito entra pela direita, como numa maquininha —
            // "5" vira "R$ 0,05", mais um "0" vira "R$ 0,50" — para quem doa
            // ver o valor em reais enquanto digita, sem confundir ponto e vírgula.
            const digitos = e.target.value.replace(/\D/g, "");
            onChange(digitos ? formatCents(Number(digitos)) : "");
          }}
          placeholder="R$ 0,00"
          className={campo}
        />
      ) : (
        <input type="hidden" name="valor" value={valor} required />
      )}
    </div>
  );
}

function DadosDoDoador({ telefoneObrigatorio }: { telefoneObrigatorio: boolean }) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>Seu nome</span>
        <input name="nome" required autoComplete="name" maxLength={120} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>
          WhatsApp ou telefone
          {!telefoneObrigatorio ? (
            <span className="font-normal text-[var(--pg-muted)]"> (opcional)</span>
          ) : null}
        </span>
        <TelefoneInput semEstilo name="telefone" required={telefoneObrigatorio} className={campo} />
      </label>
    </>
  );
}

interface CampaignDonationFormProps {
  campaignId: string;
  valoresSugeridos: number[];
  valorPadraoCents: number | null;
  permitirValorLivre: boolean;
  /** Link wa.me da igreja, quando ela tem WhatsApp cadastrado. */
  whatsappHref: string | null;
}

function PixDonationForm({
  campaignId,
  valoresSugeridos,
  valorPadraoCents,
  permitirValorLivre,
  whatsappHref,
}: CampaignDonationFormProps) {
  const [state, formAction, pending] = useActionState(submitPixCampaignDonationAction, undefined);
  // Aqui o "sucesso" traz os dados do Pix (não é uma mensagem): só o erro vira toast.
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  const [valor, setValor] = useState(valorPadraoCents ? formatCents(valorPadraoCents) : "");

  if (state?.success) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-[var(--pg-accent-soft)] p-4" role="status">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--pg-text)]">
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--pg-accent)]" aria-hidden />
          Copie a chave (ou aponte a câmera para o QR Code) e pague no app do seu banco.
        </p>
        <CopyPix
          chave={state.success.pixChave}
          churchId={campaignId}
          copiaECola={state.success.pixCopiaECola}
          qrDataUrl={state.success.pixQrDataUrl}
        />
        <p className="text-sm leading-6 text-[var(--pg-muted)]">
          Depois de pagar,{" "}
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="font-semibold text-[var(--pg-accent)] underline underline-offset-4">
              envie o comprovante pelo WhatsApp da igreja
            </a>
          ) : (
            "envie o comprovante para a igreja"
          )}{" "}
          — é assim que a doação é confirmada.
        </p>
      </div>
    );
  }

  return (
    <Formulario action={formAction} estado={state} className="relative flex flex-col gap-3">
      <CamposAntiRobo />
      <input type="hidden" name="campaignId" value={campaignId} />
      <DadosDoDoador telefoneObrigatorio />
      <SeletorDeValor
        valoresSugeridos={valoresSugeridos}
        valorPadraoCents={valorPadraoCents}
        permitirValorLivre={permitirValorLivre}
        valor={valor}
        onChange={setValor}
      />
      <Enviar pending={pending}>Gerar PIX</Enviar>
    </Formulario>
  );
}

function GatewayDonationForm({
  campaignId,
  valoresSugeridos,
  valorPadraoCents,
  permitirValorLivre,
}: CampaignDonationFormProps) {
  const [state, formAction, pending] = useActionState(submitGatewayCampaignDonationAction, undefined);
  useActionToast(state);
  const [valor, setValor] = useState(valorPadraoCents ? formatCents(valorPadraoCents) : "");

  return (
    <Formulario action={formAction} estado={state} className="relative flex flex-col gap-3">
      <CamposAntiRobo />
      <input type="hidden" name="campaignId" value={campaignId} />
      <DadosDoDoador telefoneObrigatorio={false} />
      <SeletorDeValor
        valoresSugeridos={valoresSugeridos}
        valorPadraoCents={valorPadraoCents}
        permitirValorLivre={permitirValorLivre}
        valor={valor}
        onChange={setValor}
      />
      <p className="text-xs leading-5 text-[var(--pg-muted)]">
        Você será levado à página segura do Asaas para pagar com cartão ou Pix. O provedor cobra
        uma tarifa sobre o valor (não é taxa da igreja nem da plataforma), descontada antes do
        valor chegar à conta dela.
      </p>
      <Enviar pending={pending}>Continuar para o pagamento</Enviar>
    </Formulario>
  );
}

export function CampaignDonationForm({
  metodoRecebimento,
  ...props
}: CampaignDonationFormProps & { metodoRecebimento: "pix" | "gateway" }) {
  return metodoRecebimento === "pix" ? <PixDonationForm {...props} /> : <GatewayDonationForm {...props} />;
}
