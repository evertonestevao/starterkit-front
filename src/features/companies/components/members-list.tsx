"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Crown, MoreHorizontal, ShieldCheck, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenant } from "@/providers/tenant-provider";
import {
  changeMemberRoleAction,
  removeMemberAction,
  transferOwnershipAction,
} from "@/server/actions/tenant";
import { permissionService } from "@/services/permissionService";
import type { MemberWithProfile } from "@/types/tenant";

const roleLabel = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/**
 * Lista de membros: tabela no desktop, cards empilhados no mobile (plano
 * §11 — nunca scroll horizontal forçado). Mesmos dados e ações nos dois.
 */
export function MembersList({ members }: { members: MemberWithProfile[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <MemberIdentity member={member} />
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {roleLabel[member.role]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(member.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell>
                  <MemberActions member={member} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <Card key={member.id}>
            <CardContent className="flex items-center gap-3">
              <MemberIdentity member={member} />
              <div className="ml-auto flex items-center gap-2">
                <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                  {roleLabel[member.role]}
                </Badge>
                <MemberActions member={member} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function MemberIdentity({ member }: { member: MemberWithProfile }) {
  const name = member.profile?.full_name ?? "Sem nome";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{name}</span>
    </div>
  );
}

function MemberActions({ member }: { member: MemberWithProfile }) {
  const { active } = useTenant();
  const [pending, startTransition] = useTransition();
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  const canChange = permissionService.canChangeRole(active.role, member.role);
  const canRemove = permissionService.canRemoveMember(active.role, member.role);
  const canTransfer = active.role === "owner" && member.role !== "owner";
  if (!canChange && !canRemove && !canTransfer) return null;

  function run(action: () => Promise<{ error?: string } | void>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          // Mensagem real da action (permissão, auditoria que desfez, etc.)
          toast.error(result.error);
        } else {
          toast.success(successMessage);
        }
      } catch {
        toast.error("Não foi possível completar a ação. Tente novamente.");
      }
    });
  }

  const nextRole = member.role === "admin" ? "member" : "admin";
  const memberName = member.profile?.full_name ?? "este membro";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label="Ações do membro"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canChange ? (
            <DropdownMenuItem
              onClick={() =>
                run(
                  () => changeMemberRoleAction(active.id, member.id, nextRole),
                  `Papel alterado para ${roleLabel[nextRole]}`,
                )
              }
            >
              <ShieldCheck className="size-4" />
              Tornar {roleLabel[nextRole]}
            </DropdownMenuItem>
          ) : null}
          {canRemove ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => run(() => removeMemberAction(active.id, member.id), "Membro removido")}
            >
              <UserMinus className="size-4" />
              Remover da empresa
            </DropdownMenuItem>
          ) : null}
          {canTransfer ? (
            <DropdownMenuItem onClick={() => setConfirmTransfer(true)}>
              <Crown className="size-4" />
              Transferir propriedade
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmTransfer} onOpenChange={setConfirmTransfer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir {active.name}?</DialogTitle>
            <DialogDescription>
              {memberName} vira owner da empresa e você passa a ser admin. Só o novo owner poderá
              desfazer essa troca.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              disabled={pending}
              onClick={() => {
                setConfirmTransfer(false);
                run(
                  () => transferOwnershipAction(active.id, member.id),
                  `${memberName} agora é owner`,
                );
              }}
            >
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
