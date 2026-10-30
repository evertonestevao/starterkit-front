"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";
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
import { signOutAction } from "@/server/actions/auth";

export interface UserMenuProps {
  userName: string;
  userEmail: string;
  avatarUrl?: string | null;
  /** Outras áreas que o usuário pode abrir (cliente, vendedor, painel). */
  areaLinks?: Array<{ href: string; label: string }>;
}

export function UserMenu({ userName, userEmail, avatarUrl, areaLinks = [] }: UserMenuProps) {
  const router = useRouter();
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
        render={<Button variant="ghost" size="icon" aria-label="Menu do usuário" />}
      >
        <Avatar className="size-7">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
          <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate">{userName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{userEmail}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {areaLinks.map((link) => (
          <DropdownMenuItem key={link.href} onClick={() => router.push(link.href)}>
            {link.label}
          </DropdownMenuItem>
        ))}
        {areaLinks.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          Alternar tema
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
