import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Campo para digitar o código curto do voucher (quando a câmera não ajuda). Funciona sem JS. */
export function BuscarVoucher({ valor = "" }: { valor?: string }) {
  return (
    <form action="/dashboard/vendas/voucher" className="flex items-center gap-2" role="search">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="codigo"
          defaultValue={valor}
          placeholder="Código do voucher"
          aria-label="Código do voucher"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-9 w-44 pl-8 font-mono uppercase"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Buscar
      </Button>
    </form>
  );
}
