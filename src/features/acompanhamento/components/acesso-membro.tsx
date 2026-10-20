"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Crown, KeyRound, Mail, MessageCircle, ShieldCheck, UserMinus, X } from "lucide-react";
import { mensagemDoConviteDeAcesso } from "@/lib/conviteAcesso";
import { saudar } from "@/lib/saudacao";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/useActionToast";
import { useTenant } from "@/providers/tenant-provider";
import {
  changeMemberRoleAction,
  convidarComLinkAction,
  definirResponsavelAction,
  inviteMemberAction,
  linkDoConviteAction,
  reenviarConviteAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/server/actions/tenant";
import { definirEmailDoMembroAction, definirWhatsappDoMembroAction } from "@/server/actions/acompanhamento";
import { TelefoneInput } from "@/components/telefone-input";
import { mascaraTelefone } from "@/lib/telefone";
import { linkWhatsapp } from "@/lib/acompanhamento";
import { PAPEL_LABEL } from "@/lib/papeis";
import { permissionService } from "@/services/permissionService";
import type { AcessoMembro, ConvitePendente, RolMembro } from "@/types/acompanhamento";
import { selectClasses } from "./campos";

export { PAPEL_LABEL };

/** Etiqueta curta de acesso, para a lista e o topo da ficha. */
export function AcessoBadge({ acesso, convite }: { acesso?: AcessoMembro; convite?: ConvitePendente }) {
  if (acesso) {
    return (
      <Badge variant={acesso.role === "member" ? "outline" : "secondary"} className="gap-1">
        <KeyRound className="size-3" aria-hidden />
        {PAPEL_LABEL[acesso.role]}
      </Badge>
    );
  }
  if (convite) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Mail className="size-3" aria-hidden />
        Convite enviado
      </Badge>
    );
  }
  return null;
}

/**
 * Acesso ao sistema, na ficha do membro. Só para owner/admin: convidar,
 * trocar papel, autorizar a chamada, cancelar convite e remover o acesso
 * (a pessoa continua membro). As actions conferem o papel de novo no servidor.
 */
export function AcessoMembroCard({
  membro,
  acesso,
  convite,
}: {
  membro: RolMembro;
  acesso?: AcessoMembro;
  convite?: ConvitePendente;
}) {
  const { active, saudacao } = useTenant();
  const [pending, start] = useTransition();

  function rodar(acao: () => Promise<{ error?: string } | void>, ok: string) {
    start(async () => {
      try {
        const r = await acao();
        if (r?.error) toast.error(r.error);
        else toast.success(ok);
      } catch {
        toast.error("Não foi possível completar a ação. Tente novamente.");
      }
    });
  }

  /**
   * Link do convite por outro canal, para quando o e-mail não chega: copia
   * para colar onde quiser, ou abre o WhatsApp do membro com a mensagem pronta.
   */
  function comLink(destino: "copiar" | "whatsapp") {
    if (!convite) return;
    start(async () => {
      const r = await linkDoConviteAction(convite.id, active.id);
      if (r.error || !r.url) {
        toast.error(r.error ?? "Não foi possível gerar o link do convite.");
        return;
      }
      const mensagem = mensagemDoConviteDeAcesso({
        saudacao: saudar(saudacao),
        igreja: r.igreja || active.name,
        email: r.email ?? "",
        url: r.url,
        expiraEm: r.expiraEm,
      });
      if (destino === "whatsapp") {
        const wa = linkWhatsapp(membro.whatsapp, mensagem);
        if (wa) window.open(wa, "_blank", "noopener,noreferrer");
        return;
      }
      try {
        await navigator.clipboard.writeText(r.url);
        toast.success("Link copiado. Cole no WhatsApp ou onde preferir.");
      } catch {
        // Navegador sem permissão de área de transferência: mostra para copiar à mão.
        toast.message("Copie o link do convite:", { description: r.url, duration: Infinity, closeButton: true });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" /> Acesso ao sistema
        </CardTitle>
        <CardDescription>
          Quem tem acesso entra no painel com o próprio e-mail. O papel define o que a pessoa pode fazer. O Responsável
          é quem responde pela igreja (o pastor): pode haver mais de um, e só um Responsável define outro.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {acesso ? (
          <>
            <p>
              Tem acesso como <strong>{PAPEL_LABEL[acesso.role]}</strong>.
            </p>
            {acesso.role === "member" ? (
              <p className="text-muted-foreground">
                O que esta pessoa usa no sistema vem dos <strong>cargos</strong> dela: cada cargo libera os módulos
                marcados em Configurações → Acessos, e quem tem mais de um cargo soma os de todos. Para mudar, edite os
                cargos do membro.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {permissionService.canChangeRole(active.role, acesso.role) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    const novo = acesso.role === "admin" ? "member" : "admin";
                    rodar(
                      () => changeMemberRoleAction(active.id, acesso.companyMemberId, novo),
                      `Agora é ${PAPEL_LABEL[novo]}.`,
                    );
                  }}
                >
                  <ShieldCheck className="size-3.5" />
                  {acesso.role === "admin" ? "Tornar Membro" : "Tornar Administrador"}
                </Button>
              ) : null}
              {/* Só um Responsável dá ou tira este papel; o servidor e o banco conferem de novo. */}
              {active.role === "owner" && acesso.role !== "owner" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={async () => {
                    const sim = await confirmar({
                      titulo: `Tornar ${membro.nome} Responsável pela igreja?`,
                      descricao:
                        "Ele passa a administrar tudo, a definir outros Responsáveis e a confirmar a chave PIX (o link do PIX só chega para ele depois de 24 horas). Você continua Responsável também. Todos os Responsáveis são avisados por e-mail.",
                      botao: "Tornar Responsável",
                    });
                    if (!sim) return;
                    rodar(
                      () => definirResponsavelAction(active.id, acesso.companyMemberId, true, membro.nome),
                      `${membro.nome} agora é Responsável.`,
                    );
                  }}
                >
                  <Crown className="size-3.5" /> Tornar Responsável
                </Button>
              ) : null}
              {active.role === "owner" && acesso.role === "owner" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={async () => {
                    const sim = await confirmar({
                      titulo: `Tirar o papel de Responsável de ${membro.nome}?`,
                      descricao:
                        "A pessoa continua com acesso, como Administrador, mas deixa de definir Responsáveis e de confirmar a chave PIX. A igreja precisa ficar com pelo menos um Responsável.",
                      botao: "Tirar o papel",
                      perigo: true,
                    });
                    if (!sim) return;
                    rodar(
                      () => definirResponsavelAction(active.id, acesso.companyMemberId, false, membro.nome),
                      `${membro.nome} agora é Administrador.`,
                    );
                  }}
                >
                  <Crown className="size-3.5" /> Deixar de ser Responsável
                </Button>
              ) : null}
              {permissionService.canRemoveMember(active.role, acesso.role) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={async () => {
                    const sim = await confirmar({
                      titulo: `Remover o acesso de ${membro.nome}?`,
                      descricao: "A pessoa deixa de entrar no sistema, mas continua como membro.",
                      botao: "Remover acesso",
                      perigo: true,
                    });
                    if (!sim) return;
                    rodar(() => removeMemberAction(active.id, acesso.companyMemberId), "Acesso removido.");
                  }}
                >
                  <UserMinus className="size-3.5" /> Remover acesso
                </Button>
              ) : null}
            </div>
          </>
        ) : convite ? (
          <div className="flex flex-col gap-3">
            <p>
              Convite aguardando <strong>{convite.email}</strong> aceitar, como {PAPEL_LABEL[convite.role]}. Vale até{" "}
              {new Date(convite.expiraEm).toLocaleDateString("pt-BR")}.
            </p>
            <WhatsappDoMembro membro={membro} />
            <p className="text-xs text-muted-foreground">
              O e-mail não chegou? Peça para olhar a caixa de spam, reenvie, ou mande o link do convite pelo WhatsApp.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await reenviarConviteAction(convite.id, active.id);
                    if (r.error) toast.error(r.error);
                    else toast.success(r.success ?? "E-mail reenviado.");
                  })
                }
              >
                <Mail className="size-3.5" /> Reenviar e-mail
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => comLink("copiar")}>
                <Copy className="size-3.5" /> Copiar link
              </Button>
              {linkWhatsapp(membro.whatsapp, "") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => comLink("whatsapp")}
                >
                  <MessageCircle className="size-3.5" /> Enviar por WhatsApp
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => rodar(() => revokeInviteAction(convite.id, active.id), "Convite cancelado.")}
              >
                <X className="size-3.5" /> Cancelar convite
              </Button>
            </div>
          </div>
        ) : membro.email ? (
          <ConvidarForm email={membro.email} companyId={active.id} membro={membro} />
        ) : (
          <EmailParaConvidar membroId={membro.id} />
        )}
      </CardContent>
    </Card>
  );
}

/** Botão "Convidar" da lista: abre a escolha do papel e envia. */
export function ConvidarDialog({ membro }: { membro: RolMembro }) {
  const { active } = useTenant();
  const [aberto, setAberto] = useState(false);
  if (!membro.email) return null;
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Mail className="size-3.5" /> Convidar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar {membro.nome} para o sistema</DialogTitle>
            <DialogDescription>A pessoa recebe um e-mail para criar a senha e entrar no painel.</DialogDescription>
          </DialogHeader>
          <ConvidarForm email={membro.email} companyId={active.id} membro={membro} onEnviado={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConvidarForm({
  email,
  companyId,
  membro,
  onEnviado,
}: {
  email: string;
  companyId: string;
  membro: RolMembro;
  onEnviado?: () => void;
}) {
  const { active, saudacao } = useTenant();
  const [papel, setPapel] = useState<"member" | "admin">("member");
  const [state, formAction, pending] = useActionState(inviteMemberAction, undefined);
  const [enviandoWhats, startWhats] = useTransition();
  const temWhats = !!linkWhatsapp(membro.whatsapp, "");

  /**
   * Convida e abre o WhatsApp do membro com o link. A janela abre já no
   * clique (senão o navegador bloqueia como pop-up) e recebe o endereço
   * quando o convite fica pronto.
   */
  function convidarPeloWhatsApp() {
    const janela = window.open("about:blank", "_blank");
    startWhats(async () => {
      const r = await convidarComLinkAction(companyId, email, papel);
      if (r.error || !r.url) {
        janela?.close();
        toast.error(r.error ?? "Não foi possível criar o convite.");
        return;
      }
      const mensagem = mensagemDoConviteDeAcesso({
        saudacao: saudar(saudacao),
        igreja: r.igreja || active.name,
        email: r.email ?? "",
        url: r.url,
        expiraEm: r.expiraEm,
      });
      const wa = linkWhatsapp(membro.whatsapp, mensagem);
      if (janela && wa) {
        janela.opener = null;
        janela.location.href = wa;
      } else if (wa) {
        window.location.href = wa;
      }
      toast.success("Convite criado. Confira a mensagem no WhatsApp e envie.");
      onEnviado?.();
    });
  }
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onEnviado?.();
  }, [state, onEnviado]);

  return (
    <div className="flex flex-col gap-3">
      <WhatsappDoMembro membro={membro} />
      <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="email" value={email} />
        <p className="text-muted-foreground">
          Sem acesso. O convite vale só para <strong className="text-foreground">{email}</strong>: mesmo que o link seja
          encaminhado, só entra quem usar esse e-mail. Ao aceitar, a conta fica ligada a este membro.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Papel no sistema</span>
            <select
              name="role"
              className={`${selectClasses} sm:w-72`}
              value={papel}
              onChange={(e) => setPapel(e.target.value as "member" | "admin")}
            >
              <option value="member">Membro — acesso operacional</option>
              <option value="admin">Administrador — gerencia equipe e configurações</option>
            </select>
          </label>
          {temWhats ? (
            <Button type="button" disabled={pending || enviandoWhats} onClick={convidarPeloWhatsApp}>
              <MessageCircle className="size-4" /> {enviandoWhats ? "Criando..." : "Convidar e enviar pelo WhatsApp"}
            </Button>
          ) : null}
          <Button type="submit" variant={temWhats ? "outline" : "default"} disabled={pending || enviandoWhats}>
            <Mail className="size-4" />{" "}
            {pending ? "Enviando..." : temWhats ? "Só por e-mail" : "Convidar para o sistema"}
          </Button>
        </div>
      </Formulario>
    </div>
  );
}

/** Sem e-mail: o campo já fica aqui (atalho), e depois de salvar aparece o convite. */
function EmailParaConvidar({ membroId }: { membroId: string }) {
  const [state, action, pending] = useActionState(definirEmailDoMembroAction, undefined);
  useActionToast(state);
  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-2">
      <input type="hidden" name="membroId" value={membroId} />
      <p className="text-muted-foreground">
        Sem acesso. Para convidar, informe o e-mail da pessoa (é por ele que ela entra e recupera a senha).
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          placeholder="email@exemplo.com"
          aria-label="E-mail do membro"
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar e-mail"}
        </Button>
      </div>
    </Formulario>
  );
}

/**
 * WhatsApp do membro no cartão de acesso: mostra o número (para conferir antes
 * de mandar o convite) ou, sem número, o campo para salvar ali mesmo.
 */
function WhatsappDoMembro({ membro }: { membro: RolMembro }) {
  const [state, action, pending] = useActionState(definirWhatsappDoMembroAction, undefined);
  useActionToast(state);
  if (membro.whatsapp) {
    return (
      <p className="flex items-center gap-1.5 text-sm">
        <MessageCircle className="size-3.5 text-muted-foreground" aria-hidden />
        WhatsApp: <strong>{mascaraTelefone(membro.whatsapp)}</strong>
      </p>
    );
  }
  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-1.5">
      <input type="hidden" name="membroId" value={membro.id} />
      <span className="text-xs text-muted-foreground">Sem WhatsApp na ficha. Salve para mandar o convite por lá:</span>
      <div className="flex flex-wrap gap-2">
        <TelefoneInput name="whatsapp" required aria-label="WhatsApp do membro" className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Salvando..." : "Salvar WhatsApp"}
        </Button>
      </div>
    </Formulario>
  );
}
