"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Mail, ShieldCheck, UserMinus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/useActionToast";
import { useTenant } from "@/providers/tenant-provider";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  setMemberPodeAcompanharAction,
  setMemberPodeGerirEbdAction,
} from "@/server/actions/tenant";
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
        {acesso.role === "member" && acesso.podeAcompanhar ? " · chamada" : ""}
        {acesso.role === "member" && acesso.podeGerirEbd ? " · EBD" : ""}
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
  const { active } = useTenant();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" /> Acesso ao sistema
        </CardTitle>
        <CardDescription>
          Quem tem acesso entra no painel com o próprio e-mail. O papel define o que a pessoa pode fazer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {acesso ? (
          <>
            <p>
              Tem acesso como <strong>{PAPEL_LABEL[acesso.role]}</strong>
              {acesso.role === "member" && acesso.podeAcompanhar ? ", autorizado a fazer a chamada" : ""}
              {acesso.role === "member" && acesso.podeGerirEbd ? ", da secretaria da EBD" : ""}.
            </p>
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
              {acesso.role === "member" && permissionService.canManageMembers(active.role) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    rodar(
                      () => setMemberPodeAcompanharAction(active.id, acesso.companyMemberId, !acesso.podeAcompanhar),
                      acesso.podeAcompanhar ? "Autorização de chamada removida." : "Agora pode fazer a chamada.",
                    )
                  }
                >
                  {acesso.podeAcompanhar ? "Tirar autorização de chamada" : "Autorizar a fazer chamada"}
                </Button>
              ) : null}
              {acesso.role === "member" && permissionService.canManageMembers(active.role) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    rodar(
                      () => setMemberPodeGerirEbdAction(active.id, acesso.companyMemberId, !acesso.podeGerirEbd),
                      acesso.podeGerirEbd ? "Saiu da secretaria da EBD." : "Agora cuida da EBD (todas as classes).",
                    )
                  }
                >
                  {acesso.podeGerirEbd ? "Tirar da secretaria da EBD" : "Autorizar secretaria da EBD"}
                </Button>
              ) : null}
              {permissionService.canRemoveMember(active.role, acesso.role) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Remover o acesso de ${membro.nome}? A pessoa continua como membro.`)) return;
                    rodar(() => removeMemberAction(active.id, acesso.companyMemberId), "Acesso removido.");
                  }}
                >
                  <UserMinus className="size-3.5" /> Remover acesso
                </Button>
              ) : null}
            </div>
          </>
        ) : convite ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              Convite enviado para <strong>{convite.email}</strong> como {PAPEL_LABEL[convite.role]}. Vale até{" "}
              {new Date(convite.expiraEm).toLocaleDateString("pt-BR")}.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => rodar(() => revokeInviteAction(convite.id, active.id), "Convite cancelado.")}
            >
              <X className="size-3.5" /> Cancelar convite
            </Button>
          </div>
        ) : membro.email ? (
          <ConvidarForm email={membro.email} companyId={active.id} />
        ) : (
          <p className="text-muted-foreground">
            Sem acesso. Para convidar, primeiro edite o membro e informe o e-mail dele.
          </p>
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
          <ConvidarForm email={membro.email} companyId={active.id} onEnviado={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConvidarForm({
  email,
  companyId,
  onEnviado,
}: {
  email: string;
  companyId: string;
  onEnviado?: () => void;
}) {
  const [papel, setPapel] = useState<"member" | "admin">("member");
  const [state, formAction, pending] = useActionState(inviteMemberAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onEnviado?.();
  }, [state, onEnviado]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="email" value={email} />
      <p className="text-muted-foreground">
        Sem acesso. Enviamos um convite para <strong className="text-foreground">{email}</strong>; ao aceitar, a
        conta fica ligada a este membro.
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
        <Button type="submit" disabled={pending}>
          <Mail className="size-4" /> {pending ? "Enviando..." : "Convidar para o sistema"}
        </Button>
      </div>
    </form>
  );
}
