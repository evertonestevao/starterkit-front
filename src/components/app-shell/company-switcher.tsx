"use client";

import { useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { useTenant } from "@/providers/tenant-provider";
import { switchCompanyAction } from "@/server/actions/tenant";

/** Seletor de empresa ativa (header, desktop e mobile). */
export function CompanySwitcher() {
  const { companies, active } = useTenant();
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="max-w-44 gap-2 sm:max-w-56" />
          }
        >
          <Building2 className="size-4 shrink-0" />
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Suas empresas</DropdownMenuLabel>
            {companies.map((company) => (
              <DropdownMenuItem
                key={company.id}
                onClick={() => startTransition(() => switchCompanyAction(company.id))}
              >
                <span className="truncate">{company.name}</span>
                {company.id === active.id ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nova empresa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>Você será o owner da nova empresa.</DialogDescription>
          </DialogHeader>
          <CreateCompanyForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
