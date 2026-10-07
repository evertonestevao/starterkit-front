"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROTA_MINHA_CONTA } from "@/lib/menuPermissoes";
import { signOutAction } from "@/server/actions/auth";

export interface UserMenuProps {
  userName: string;
  userEmail: string;
  avatarUrl?: string | null;
  /** Convites de outras igrejas esperando a pessoa aceitar (ficam em Minha conta). */
  convitesPendentes?: number;
}

export function UserMenu({ userName, userEmail, avatarUrl, convitesPendentes = 0 }: UserMenuProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  const initials = userName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              convitesPendentes > 0 ? `Menu do usuário, ${convitesPendentes} convite(s) pendente(s)` : "Menu do usuário"
            }
          />
        }
      >
        <Avatar className="size-7">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
          <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
        </Avatar>
        {convitesPendentes > 0 ? (
          <span
            className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-background"
            aria-hidden
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate">{userName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{userEmail}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={ROTA_MINHA_CONTA} />}>
          <UserRound className="size-4" />
          Minha conta
          {convitesPendentes > 0 ? (
            <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-medium text-white">
              {convitesPendentes}
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          Alternar tema
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => startTransition(() => signOutAction())}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
