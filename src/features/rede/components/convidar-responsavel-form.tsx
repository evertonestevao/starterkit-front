"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { TelefoneInput } from "@/components/telefone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatarData, linkWhatsapp } from "@/lib/acompanhamento";
import { convidarResponsavelAction } from "@/server/actions/redeCadastro";

/**
 * Convidar quem vai assumir a igreja. O link sai uma vez só (o banco guarda o
 * hash): copiar, mandar pelo WhatsApp ou mostrar o QR Code para a pessoa
 * apontar a câmera. Gerar outro cancela o anterior.
 */
export function ConvidarResponsavelForm({
  churchId,
  igreja,
  troca = false,
}: {
  churchId: string;
  igreja: string;
  /** A igreja já tem Responsável: é uma troca (só o Responsável de cima). */
  troca?: boolean;
}) {
  const [state, action, pending] = useActionState(convidarResponsavelAction, undefined);
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  const [cargo, setCargo] = useState<"pastor" | "secretario">("pastor");
  const { copied, copy } = useCopyToClipboard(2500);
  const [substituir, setSubstituir] = useState(true);

  if (state?.success) {
    const g = state.success;
    const mensagem = `Olá, ${g.nome.split(" ")[0]}! A igreja ${igreja} já está cadastrada no AssembleiaApp e você foi convidado para ser o responsável por ela. Toque no link para assumir (vale até ${formatarData(g.expiraEm.slice(0, 10))}):\n${g.link}`;
    // Com o WhatsApp da pessoa, abre a conversa com ela; sem, abre para escolher o contato.
    const whats =
      (g.whatsapp && linkWhatsapp(g.whatsapp, mensagem)) || `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3" role="status">
        <p className="text-sm font-medium">Convite para {g.nome} gerado. Mande agora: este link não aparece de novo.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={g.qrDataUrl}
            alt="QR Code para assumir a igreja"
            width={512}
            height={512}
            className="size-40 shrink-0 self-center rounded-lg bg-white p-2 sm:self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Pessoalmente: a pessoa aponta a câmera do celular para o QR Code e assume ali mesmo.
            </p>
            <a
              href={whats}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <MessageCircle className="size-4" /> Enviar pelo WhatsApp
            </a>
            <Button type="button" variant="outline" onClick={() => copy(g.link)}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Link copiado" : "Copiar link"}
            </Button>
            <p className="truncate font-mono text-xs text-muted-foreground" title={g.link}>
              {g.link}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="cargo" value={cargo} />
      {troca && substituir ? <input type="hidden" name="substituir" value="on" /> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quem vai assumir">
        {(
          [
            ["pastor", "Pastor"],
            ["secretario", "Secretário(a)"],
          ] as const
        ).map(([valor, rotulo]) => (
          <label
            key={valor}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              cargo === valor ? "border-primary bg-primary/5 font-medium" : ""
            }`}
          >
            <input type="radio" checked={cargo === valor} onChange={() => setCargo(valor)} className="accent-primary" />
            {rotulo}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`nome-${churchId}`}>Nome</Label>
          <Input id={`nome-${churchId}`} name="nome" required minLength={2} maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`email-${churchId}`}>E-mail</Label>
          <Input id={`email-${churchId}`} name="email" type="email" required maxLength={254} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`whats-${churchId}`}>WhatsApp (opcional)</Label>
          <TelefoneInput id={`whats-${churchId}`} name="whatsapp" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A conta dele fica no e-mail informado (é por ele que recupera a senha): confira com a pessoa. O convite vale 7
        dias e só funciona para esse e-mail.
      </p>
      {troca ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={substituir}
            onChange={(e) => setSubstituir(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            Substituir os responsáveis atuais quando ele assumir
            <span className="block text-xs text-muted-foreground">
              Quem responde hoje perde o acesso (o cadastro de membro continua) e é avisado por e-mail. Desmarcado, os
              dois ficam como Responsáveis.
            </span>
          </span>
        </label>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Gerando..." : "Gerar convite"}
      </Button>
    </Formulario>
  );
}
