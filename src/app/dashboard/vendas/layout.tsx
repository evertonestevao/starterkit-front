import { notFound } from "next/navigation";
import { exigeMenu } from "@/server/menuPermissoes";
import { getVendasActorAutorizado } from "@/server/vendas";

/**
 * Vendas: camiseta, pastel, lanche vendidos pela página da igreja. Sem o
 * módulo, 404 mesmo com a URL na mão; o service e a RLS (`tem_acesso`) recusam de novo.
 */
export default async function VendasLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("vendas");
  if (!(await getVendasActorAutorizado())) notFound();
  return <div className="flex flex-col gap-5">{children}</div>;
}
