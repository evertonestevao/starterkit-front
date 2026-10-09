import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Package,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PedidosLista } from "@/features/vendas/components/pedidos-lista";
import { VendaAcoes } from "@/features/vendas/components/venda-acoes";
import { VendaForm } from "@/features/vendas/components/venda-form";
import { hojeISO } from "@/lib/acompanhamento";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { isAppError } from "@/lib/errors";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";
import { paginaDaUrl, paginar } from "@/lib/paginacao";
import {
  SITUACAO_VENDA,
  STATUS_PEDIDO,
  filtrarPedidos,
  resumirPedidos,
  situacaoDaVenda,
  totaisPorItem,
  unidadesReservadas,
  type FiltroPedido,
} from "@/lib/vendas";
import { getChurchProfileService } from "@/server/churchProfile";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Venda" };

const FILTROS_PAGAMENTO: FiltroPedido[] = [
  "todos",
  "pendente",
  "pago",
  "cancelado",
];
/** Com voucher, dá para filtrar também pela retirada. */
const FILTROS_ENTREGA: FiltroPedido[] = ["a_entregar", "entregue"];
/** Pedidos por página (o segundo é o padrão). */
const POR_PAGINA = [10, 25, 50, 100];
const ROTULO_FILTRO: Record<string, string> = {
  todos: "Todos",
  a_entregar: "A entregar",
  entregue: "Entregues",
};

export default async function VendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    q?: string;
    editar?: string;
    page?: string;
    por?: string;
  }>;
}) {
  const actor = await getVendasActorAutorizado();
  if (!actor) notFound();
  const { id } = await params;

  const detalhe = await (
    await getVendasService()
  )
    .detalhe(actor, id)
    .catch((err: unknown) => {
      if (isAppError(err) && err.code === "not_found") return null;
      throw err;
    });
  if (!detalhe) notFound();
  const { venda, pedidos } = detalhe;

  const hoje = hojeISO();
  const situacao = situacaoDaVenda(venda, unidadesReservadas(pedidos), hoje);
  const resumo = resumirPedidos(pedidos);
  const totais = totaisPorItem(
    pedidos,
    venda.opcoes.map((o) => o.nome),
  );
  const sp = await searchParams;
  const filtros = [
    ...FILTROS_PAGAMENTO,
    ...(venda.geraVoucher ? FILTROS_ENTREGA : []),
  ];
  const status: FiltroPedido = filtros.includes(sp.status as FiltroPedido)
    ? (sp.status as FiltroPedido)
    : "todos";
  // Venda pronta não fica aberta para edição: o formulário abre pelo botão.
  const editando = sp.editar === "1";
  const busca = (sp.q ?? "").slice(0, 80);
  const base = `/dashboard/vendas/${venda.id}`;
  const filtrados = filtrarPedidos(pedidos, { status, busca });
  const porPagina = POR_PAGINA.includes(Number(sp.por))
    ? Number(sp.por)
    : POR_PAGINA[1];
  const pag = paginar(filtrados, paginaDaUrl(sp.page), porPagina);
  // O que a URL leva ao trocar de página, filtro ou tamanho da página.
  const paramsDaLista = {
    status: status !== "todos" ? status : undefined,
    q: busca || undefined,
    por: porPagina !== POR_PAGINA[1] ? String(porPagina) : undefined,
  };
  const linkDaLista = (troca: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...paramsDaLista, ...troca }))
      if (v) qs.set(k, v);
    return qs.size ? `${base}?${qs}` : base;
  };
  // Link para a página pública da venda (a igreja ativa).
  const igreja = (
    await (
      await getChurchProfileService()
    )
      .list(actor.companyId)
      .catch(() => [])
  )[0];
  const linkPublico = igreja
    ? `${caminhoDaIgreja(igreja.chavePublica)}/vendas/${venda.id}`
    : null;

  return (
    <>
      <Link
        href="/dashboard/vendas"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Vendas
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight break-words">
            {venda.titulo}
          </h2>
          <Badge
            variant={
              situacao === "aberta"
                ? "default"
                : situacao === "aguardando_pix"
                  ? "outline"
                  : "secondary"
            }
          >
            {SITUACAO_VENDA[situacao]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={editando ? base : `${base}?editar=1#editar`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="size-4" />{" "}
            {editando ? "Fechar edição" : "Editar venda"}
          </Link>
          <VendaAcoes venda={venda} temPedidos={pedidos.length > 0} />
        </div>
      </div>

      {situacao === "aguardando_pix" ? (
        <Alert>
          <Clock className="size-4" />
          <AlertDescription>
            A venda ainda não aparece na página. Enviamos ao Responsável da
            igreja um e-mail para confirmar a chave Pix{" "}
            <strong>{venda.pixChave}</strong> ({venda.pixTitular})
            {venda.whatsappComprovante ? (
              <>
                {" "}
                e o WhatsApp do comprovante{" "}
                <strong>{mascaraTelefone(venda.whatsappComprovante)}</strong>
              </>
            ) : null}
            . Assim que ele confirmar, ela entra no ar.
          </AlertDescription>
        </Alert>
      ) : situacao === "aberta" && linkPublico ? (
        <a
          href={linkPublico}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
        >
          Ver na página da igreja <ExternalLink className="size-3.5" />
        </a>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Package}
          label="Unidades pedidas"
          value={String(resumo.unidades)}
          hint={[
            venda.estoque !== null
              ? `de ${venda.estoque} no estoque`
              : `${resumo.pedidos} pedido(s)`,
            venda.geraVoucher ? `${resumo.entregues} entregue(s)` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <MetricCard
          icon={Wallet}
          label="Pago"
          value={formatCents(resumo.pagoCents)}
        />
        <MetricCard
          icon={Clock}
          label="A confirmar"
          value={formatCents(resumo.pendenteCents)}
        />
      </div>

      {totais.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {venda.temOpcoes ? "Total de cada opção" : "Total"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Lista simples (e não tabela): no celular continua legível. */}
            <ul className="flex flex-col divide-y text-sm">
              {totais.map((t) => (
                <li
                  key={t.nome}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2"
                >
                  <span className="font-medium">{t.nome}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span>
                      <strong>{t.unidades}</strong> un.
                      <span className="text-muted-foreground">
                        {" "}
                        · {t.pagas} paga{t.pagas === 1 ? "" : "s"}
                        {venda.geraVoucher
                          ? ` · ${t.entregues} entregue${t.entregues === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </span>
                    <span className="w-24 text-right">
                      {formatCents(t.totalCents)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Pedidos cancelados não entram na conta.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Pedidos</h3>
          {pedidos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <a
                href={`${base}/exportar?formato=xlsx`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-2",
                )}
              >
                <FileSpreadsheet className="size-4" /> Baixar Excel
              </a>
              <a
                href={`${base}/exportar`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "gap-2",
                )}
              >
                <Download className="size-4" /> CSV
              </a>
            </div>
          ) : null}
        </div>
        {pedidos.length > 0 ? (
          // Filtro por URL: funciona sem JS e o link filtrado pode ser guardado.
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            role="search"
          >
            <div className="flex flex-wrap gap-1">
              {filtros.map((f) => {
                const qtd = filtrarPedidos(pedidos, {
                  status: f,
                  busca: "",
                }).length;
                return (
                  <Link
                    key={f}
                    href={linkDaLista({
                      status: f !== "todos" ? f : undefined,
                      page: undefined,
                    })}
                    className={buttonVariants({
                      variant: status === f ? "default" : "ghost",
                      size: "sm",
                    })}
                  >
                    {ROTULO_FILTRO[f] ??
                      STATUS_PEDIDO[f as keyof typeof STATUS_PEDIDO]}{" "}
                    ({qtd})
                  </Link>
                );
              })}
            </div>
            {status !== "todos" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {paramsDaLista.por ? (
              <input type="hidden" name="por" value={paramsDaLista.por} />
            ) : null}
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                defaultValue={busca}
                placeholder="Nome, WhatsApp ou voucher"
                aria-label="Buscar pedido"
                className="h-9 pl-8"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Buscar
            </Button>
          </form>
        ) : null}
        {pedidos.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido ainda. Quando alguém comprar pela página, o pedido
            aparece aqui para você conferir o comprovante e marcar como pago.
          </p>
        ) : filtrados.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido com este filtro.
          </p>
        ) : (
          <>
            <PedidosLista
              pedidos={pag.itens}
              titulo={venda.titulo}
              temOpcoes={venda.temOpcoes}
              geraVoucher={venda.geraVoucher}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Por página:
                {POR_PAGINA.map((n) => (
                  <Link
                    key={n}
                    href={linkDaLista({
                      por: n !== POR_PAGINA[1] ? String(n) : undefined,
                      page: undefined,
                    })}
                    className={buttonVariants({
                      variant: n === porPagina ? "secondary" : "ghost",
                      size: "sm",
                    })}
                    aria-current={n === porPagina ? "true" : undefined}
                  >
                    {n}
                  </Link>
                ))}
              </div>
              <div className="sm:min-w-80">
                <PaginationControls
                  page={pag.pagina}
                  pageSize={porPagina}
                  total={pag.total}
                  basePath={base}
                  params={paramsDaLista}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {editando ? (
        <Card id="editar" className="max-w-2xl scroll-mt-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Editar venda</CardTitle>
            <Link
              href={base}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Fechar
            </Link>
          </CardHeader>
          <CardContent>
            <VendaForm
              key={`${venda.id}:${venda.precoCents}:${venda.pixChave}:${venda.whatsappComprovante ?? ""}:${venda.temOpcoes}:${venda.opcoes.map((o) => `${o.id}=${o.nome}=${o.precoCents}`).join(",")}`}
              venda={venda}
              hoje={hoje}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
