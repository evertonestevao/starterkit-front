"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { formatChurchName } from "@/lib/churchName";
import { useTenant } from "@/providers/tenant-provider";
import { switchCompanyAction } from "@/server/actions/tenant";

/** Seletor de empresa ativa (header, desktop e mobile). */
export function CompanySwitcher({ podeCriarIgreja = false }: { podeCriarIgreja?: boolean }) {
  const { companies, active } = useTenant();
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="max-w-[46vw] gap-2 sm:max-w-64"
              aria-label={`Igreja ativa: ${formatChurchName(active.name, active.complemento)}. Trocar de igreja`}
            />
          }
        >
          <Building2 className="size-4 shrink-0" />
          {/* Numa rede todas começam com o mesmo nome: quem distingue é o complemento. */}
          <span className="truncate">{active.complemento ?? active.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1.5rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Suas igrejas</DropdownMenuLabel>
            {companies.map((company) => (
              <DropdownMenuItem
                key={company.id}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await switchCompanyAction(company.id);
                      if (result?.error) {
                        toast.error(result.error);
                      } else {
                        router.push("/dashboard"); // navegação no client (sem redirect na action)
                      }
                    } catch {
                      toast.error(
                        "Não foi possível trocar de igreja. Tente novamente.",
                      );
                    }
                  })
                }
              >
                <span className="min-w-0">
                  <span className="block break-words">{company.name}</span>
                  {company.complemento ? (
                    <span className="block text-xs break-words text-muted-foreground">{company.complemento}</span>
                  ) : null}
                </span>
                {company.id === active.id ? (
                  <Check className="ml-auto size-4 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {podeCriarIgreja ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Nova igreja
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova igreja</DialogTitle>
            <DialogDescription>
              Você será o responsável dessa igreja.
            </DialogDescription>
          </DialogHeader>
          <CreateCompanyForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
