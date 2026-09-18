"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  submitEventSignupAction,
  submitPrayerRequestAction,
  submitVisitorAction,
} from "@/server/actions/church";
import type { ActionState } from "@/server/actions/action-state";

/**
 * Os três formulários da página pública da igreja (oração, primeira visita e
 * inscrição). Cada um mora na sua seção, aberto — a grade de atalhos do topo
 * leva direto a ele. As cores vêm das variáveis --pg-* do tema da igreja.
 */

type BoundAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

const campo =
  "h-12 w-full rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-3.5 text-base text-[var(--pg-text)] outline-none transition-shadow placeholder:text-[var(--pg-muted)] focus:ring-2 focus:ring-[var(--pg-accent)]";

const rotulo = "text-sm font-medium text-[var(--pg-text)]";

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
 * Formulário que troca por uma confirmação quando dá certo. "Enviar outro"
 * remonta o formulário limpo — sem isso, quem manda o segundo pedido acharia
 * que o primeiro não foi.
 */
function FormularioComRetorno({
  action,
  children,
  botao,
  aposSucesso,
}: {
  action: BoundAction;
  children: ReactNode;
  botao: string;
  /** O que mostrar junto da confirmação (ex.: como pagar um evento pago). */
  aposSucesso?: ReactNode;
}) {
  const [versao, setVersao] = useState(0);
  return (
    <Formulario
      key={versao}
      action={action}
      botao={botao}
      aposSucesso={aposSucesso}
      onOutro={() => setVersao((v) => v + 1)}
    >
      {children}
    </Formulario>
  );
}

function Formulario({
  action,
  children,
  botao,
  aposSucesso,
  onOutro,
}: {
  action: BoundAction;
  children: ReactNode;
  botao: string;
  aposSucesso?: ReactNode;
  onOutro: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.success) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-[var(--pg-accent-soft)] p-4" role="status">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--pg-text)]">
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--pg-accent)]" aria-hidden />
          {state.success}
        </p>
        {aposSucesso}
        <button
          type="button"
          onClick={onOutro}
          className="text-sm font-medium text-[var(--pg-accent)] underline underline-offset-4"
        >
          Enviar outro
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      {state?.error ? (
        <p role="alert" className="text-sm text-[var(--pg-danger)]">
          {state.error}
        </p>
      ) : null}
      <Enviar pending={pending}>{botao}</Enviar>
    </form>
  );
}

function Campo({ rotulo: texto, opcional, children }: { rotulo: string; opcional?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={rotulo}>
        {texto}
        {opcional ? <span className="font-normal text-[var(--pg-muted)]"> (opcional)</span> : null}
      </span>
      {children}
    </label>
  );
}

export function PrayerForm({ churchId }: { churchId: string }) {
  return (
    <FormularioComRetorno action={submitPrayerRequestAction.bind(null, churchId)} botao="Enviar pedido">
      <Campo rotulo="Seu nome" opcional>
        <input name="name" autoComplete="name" maxLength={120} placeholder="Pode deixar em branco" className={campo} />
      </Campo>
      <Campo rotulo="Pelo que podemos orar?">
        <textarea
          name="message"
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          className={`${campo} h-auto min-h-32 py-3 leading-6`}
        />
      </Campo>
    </FormularioComRetorno>
  );
}

export function VisitorForm({ churchId }: { churchId: string }) {
  return (
    <FormularioComRetorno action={submitVisitorAction.bind(null, churchId)} botao="Quero ser recebido">
      <Campo rotulo="Seu nome">
        <input name="name" required autoComplete="name" maxLength={120} className={campo} />
      </Campo>
      <Campo rotulo="WhatsApp, telefone ou email">
        <input name="contact" required autoComplete="tel" maxLength={160} placeholder="(11) 99999-9999" className={campo} />
      </Campo>
    </FormularioComRetorno>
  );
}

/**
 * Inscrição num evento publicado. Não existe mais "qual evento?": o evento é
 * o da tela, e o nome dele vem do banco. Evento pago é pago direto à igreja —
 * a plataforma não cobra —, então a confirmação já diz como.
 */
export function EventSignupForm({
  eventId,
  preco,
  pagamento,
}: {
  eventId: string;
  /** Texto do preço já formatado, ou null se for gratuito. */
  preco: string | null;
  /** Instrução de pagamento para mostrar depois da inscrição (evento pago). */
  pagamento?: ReactNode;
}) {
  return (
    <FormularioComRetorno
      action={submitEventSignupAction.bind(null, eventId)}
      botao={preco ? `Inscrever-me · ${preco}` : "Inscrever-me"}
      aposSucesso={pagamento}
    >
      <Campo rotulo="Seu nome">
        <input name="person_name" required autoComplete="name" maxLength={120} className={campo} />
      </Campo>
      <Campo rotulo="WhatsApp, telefone ou email">
        <input name="contact" required autoComplete="tel" maxLength={160} placeholder="(11) 99999-9999" className={campo} />
      </Campo>
    </FormularioComRetorno>
  );
}
