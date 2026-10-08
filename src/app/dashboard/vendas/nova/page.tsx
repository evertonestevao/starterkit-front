import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VendaForm } from "@/features/vendas/components/venda-form";
import { hojeISO } from "@/lib/acompanhamento";

export const metadata: Metadata = { title: "Nova venda" };

export default function NovaVendaPage() {
  return (
    <>
      <Link href="/dashboard/vendas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendas
      </Link>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Nova venda</CardTitle>
          <CardDescription>
            Quem compra escolhe a quantidade na página da igreja, deixa o WhatsApp e uma observação, e paga o Pix com o
            total já calculado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendaForm hoje={hojeISO()} />
        </CardContent>
      </Card>
    </>
  );
}
