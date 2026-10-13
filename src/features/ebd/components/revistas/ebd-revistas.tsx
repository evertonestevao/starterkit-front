"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Check, Copy, PackageCheck, Pencil, Plus, Printer, Search, Wallet, X } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatarData } from "@/lib/acompanhamento";
import { formatarReais } from "@/lib/ebd";
import {
  faltaDoPedido,
  filtrarPedidos,
  pagoDoPedido,
  resumoDaCompra,
  resumoDosPedidos,
  situacaoDoPagamento,
  textoDoResumoDaCompra,
  totalDoPedido,
  type FiltroDePedidos,
} from "@/lib/ebdRevistas";
import { paginar } from "@/lib/paginacao";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { cancelarPedidoRevistaAction, marcarEntregaRevistaAction } from "@/server/actions/ebdRevistas";
import type { EbdRevistaPedido, EbdRevistasDoTrimestre, EbdRevistasRede } from "@/types/ebdRevistas";
import { PagamentoForm } from "./pagamento-form";
import { PedidoForm, type PessoaDoPedido } from "./pedido-form";
import { RedeDeRevistas } from "./rede-de-revistas";
import { RevistasDoTrimestre } from "./revistas-do-trimestre";

/** Pedidos por página. */
const POR_PAGINA = 15;

type Aba = "pedidos" | "compra" | "sem_pedido" | "rede" | "revistas";

const SELO = {
  verde: "border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  amarelo: "border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  vermelho: "border-red-600/30 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  cinza: "border-border bg-muted text-muted-foreground",
} as const;

function Selo({ cor, children }: { cor: keyof typeof SELO; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", SELO[cor])}>
      {children}
    </span>
  );
}

/**
 * Pedidos de revista do trimestre: quem pediu, quanto pagou e se já recebeu.
 * Quatro partes: os pedidos, o resumo para a compra, quem ainda não pediu e
 * as revistas (título e preço) do trimestre.
 */
export function EbdRevistas({
  trimestreId,
  trimestres,
  dados,
  lista,
  rede,
  classes,
  igreja,
  hoje,
}: {
  trimestreId: string;
  trimestres: Array<{ id: string; nome: string }>;
  dados: EbdRevistasDoTrimestre;
  /** De quem é a lista de revistas: desta igreja, ou da igreja de cima (congregação ligada). */
  lista: { propria: boolean; donaNome: string };
  /** Aba Rede (só a igreja que compra para ela e as congregações). */
  rede: EbdRevistasRede | null;
  classes: Array<{ id: string; nome: string }>;
  /** Nome completo da igreja, para o resumo da compra. */
  igreja: string;
  /** AAAA-MM-DD. */
  hoje: string;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(dados.revistas.length === 0 && lista.propria ? "revistas" : "pedidos");
  const [situacao, setSituacao] = useState<FiltroDePedidos>("todos");
  const [revistaId, setRevistaId] = useState("");
  const [classe, setClasse] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [pedindo, setPedindo] = useState<{ pedido?: EbdRevistaPedido; pessoa?: PessoaDoPedido } | null>(null);
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { copied, copy } = useCopyToClipboard(2500);

  const { revistas, pedidos, semPedido } = dados;
  const trimestre = trimestres.find((t) => t.id === trimestreId);
  const resumo = resumoDosPedidos(pedidos);
  const compra = resumoDaCompra(pedidos);
  const cancelados = pedidos.filter((p) => p.cancelado).length;
  const filtrados = filtrarPedidos(pedidos, { situacao, revistaId, classe, busca });
  const pag = paginar(filtrados, pagina, POR_PAGINA);
  const classesDosPedidos = [...new Set(pedidos.flatMap((p) => (p.classeNome ? [p.classeNome] : [])))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const jaPediram = new Set(pedidos.flatMap((p) => (p.membroId && !p.cancelado ? [p.membroId] : [])));
  const pagando = pedidos.find((p) => p.id === pagandoId);

  function rodar(acao: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  }
  const mudar =
    <T,>(setter: (v: T) => void) =>
    (valor: T) => {
      setter(valor);
      setPagina(1);
    };

  const abas: Array<[Aba, string]> = [
    ["pedidos", `Pedidos (${resumo.pedidos})`],
    ["sem_pedido", `Quem não pediu (${semPedido.length})`],
    ["compra", "Resumo da compra"],
    ...(rede ? ([["rede", "Rede"]] as Array<[Aba, string]>) : []),
    ...(lista.propria ? ([["revistas", `Revistas e preços (${revistas.length})`]] as Array<[Aba, string]>) : []),
  ];
  const situacoes: Array<[FiltroDePedidos, string]> = [
    ["todos", `Todos (${resumo.pedidos})`],
    ["devendo", `Devendo (${resumo.devendo})`],
    ["pagos", `Pagos (${resumo.pedidos - resumo.devendo})`],
    ["a_entregar", `A entregar (${resumo.aEntregar})`],
    ["entregues", `Entregues (${resumo.entregues})`],
    ...(cancelados > 0 ? ([["cancelados", `Cancelados (${cancelados})`]] as Array<[FiltroDePedidos, string]>) : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">Trimestre</span>
          <select
            className={cn(selectClasses, "min-w-56")}
            value={trimestreId}
            onChange={(e) => router.push(`/dashboard/ebd/revistas?trimestre=${e.target.value}`)}
          >
            {trimestres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" disabled={revistas.length === 0} onClick={() => setPedindo({})}>
          <Plus className="size-4" /> Novo pedido
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Numero
          rotulo="Revistas pedidas"
          valor={String(resumo.revistas)}
          detalhe={`em ${resumo.pedidos} ${resumo.pedidos === 1 ? "pedido" : "pedidos"}`}
        />
        <Numero rotulo="Total dos pedidos" valor={formatarReais(resumo.totalCentavos)} />
        <Numero rotulo="Já recebido" valor={formatarReais(resumo.recebidoCentavos)} />
        <Numero
          rotulo="A receber"
          valor={formatarReais(resumo.aReceberCentavos)}
          detalhe={`${resumo.devendo} ${resumo.devendo === 1 ? "pessoa devendo" : "pessoas devendo"} · ${resumo.aEntregar} a entregar`}
        />
      </div>
      {resumo.recebidoEmCanceladosCentavos > 0 ? (
        <p className="text-xs text-muted-foreground print:hidden">
          Há {formatarReais(resumo.recebidoEmCanceladosCentavos)} recebidos em pedidos cancelados (veja o filtro
          “Cancelados”), para devolver ou acertar.
        </p>
      ) : null}

      <div
        className="-mb-px flex gap-1 overflow-x-auto border-b print:hidden"
        role="tablist"
        aria-label="Partes dos pedidos de revista"
      >
        {abas.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              aba === valor
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "pedidos" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar por situação">
            {situacoes.map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={situacao === valor}
                onClick={() => mudar(setSituacao)(valor)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm tabular-nums",
                  situacao === valor && "border-primary bg-primary/10 font-medium",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar pelo nome"
                value={busca}
                onChange={(e) => mudar(setBusca)(e.target.value)}
                className="h-9 pl-8"
                aria-label="Buscar pedido pelo nome"
              />
            </div>
            {revistas.length > 1 ? (
              <select
                aria-label="Filtrar por revista"
                className={cn(selectClasses, "sm:w-56")}
                value={revistaId}
                onChange={(e) => mudar(setRevistaId)(e.target.value)}
              >
                <option value="">Todas as revistas</option>
                {revistas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.titulo}
                  </option>
                ))}
              </select>
            ) : null}
            {classesDosPedidos.length > 1 ? (
              <select
                aria-label="Filtrar por classe"
                className={cn(selectClasses, "sm:w-48")}
                value={classe}
                onChange={(e) => mudar(setClasse)(e.target.value)}
              >
                <option value="">Todas as classes</option>
                {classesDosPedidos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {pag.itens.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {pedidos.length === 0
                ? revistas.length === 0
                  ? "Cadastre primeiro as revistas do trimestre (título e preço)."
                  : "Nenhum pedido neste trimestre ainda. Clique em “Novo pedido”."
                : "Nenhum pedido com esse filtro."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {pag.itens.map((p) => {
                const falta = faltaDoPedido(p);
                const pagamento = situacaoDoPagamento(p);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 px-3 py-2.5 text-sm lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="truncate">{p.nome}</span>
                        {p.cancelado ? (
                          <Selo cor="cinza">Cancelado</Selo>
                        ) : (
                          <>
                            <Selo
                              cor={pagamento === "pago" ? "verde" : pagamento === "parcial" ? "amarelo" : "vermelho"}
                            >
                              {pagamento === "pago" ? "Pago" : `Falta ${formatarReais(falta)}`}
                            </Selo>
                            <Selo cor={p.entregueEm ? "verde" : "cinza"}>
                              {p.entregueEm ? `Entregue em ${formatarData(p.entregueEm).slice(0, 5)}` : "Não entregue"}
                            </Selo>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          p.deFora ? "De fora do cadastro" : p.classeNome,
                          p.itens.map((i) => `${i.quantidade} × ${i.titulo}`).join(", "),
                          `total ${formatarReais(totalDoPedido(p))}`,
                          pagoDoPedido(p) > 0 && falta > 0 ? `pago ${formatarReais(pagoDoPedido(p))}` : null,
                          mascaraTelefone(p.telefone) || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {p.observacao ? <p className="text-xs italic text-muted-foreground">{p.observacao}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5 lg:shrink-0 lg:flex-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setPagandoId(p.id)}
                      >
                        <Wallet className="size-3.5" /> {p.cancelado || falta === 0 ? "Pagamentos" : "Receber"}
                      </Button>
                      {p.cancelado ? null : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => rodar(() => marcarEntregaRevistaAction(p.id, !p.entregueEm))}
                          >
                            <PackageCheck className="size-3.5" /> {p.entregueEm ? "Desfazer entrega" : "Entregar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            aria-label={`Alterar o pedido de ${p.nome}`}
                            onClick={() => setPedindo({ pedido: p })}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            aria-label={`Cancelar o pedido de ${p.nome}`}
                            onClick={async () => {
                              const sim = await confirmar({
                                titulo: `Cancelar o pedido de ${p.nome}?`,
                                descricao:
                                  pagoDoPedido(p) > 0
                                    ? `Já foram recebidos ${formatarReais(pagoDoPedido(p))}. O pedido fica como cancelado, com esse valor à vista, para você devolver ou acertar.`
                                    : "O pedido sai da lista e das contas do trimestre.",
                                botao: "Cancelar pedido",
                                perigo: true,
                              });
                              if (sim) rodar(() => cancelarPedidoRevistaAction(p.id));
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <PaginacaoLocal
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            total={pag.total}
            onMudar={setPagina}
            rotulo="pedido"
          />
        </div>
      ) : null}

      {aba === "compra" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-muted-foreground">
              Quantas revistas de cada título comprar, somando os pedidos. Pedido cancelado não entra.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={compra.length === 0}
                onClick={() =>
                  copy(textoDoResumoDaCompra({ igreja, trimestre: trimestre?.nome ?? "", linhas: compra }))
                }
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={compra.length === 0}
                onClick={() => window.print()}
              >
                <Printer className="size-4" /> Imprimir
              </Button>
            </div>
          </div>
          {compra.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sem pedidos ainda: o resumo aparece quando houver o primeiro pedido.
            </p>
          ) : (
            <div className="rounded-lg border p-4">
              <p className="font-semibold">Pedido de revistas da EBD · {trimestre?.nome}</p>
              <p className="text-sm text-muted-foreground">{igreja}</p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Revista</th>
                    <th className="py-1.5 text-right font-medium">Quantidade</th>
                    <th className="py-1.5 text-right font-medium">Valor dos pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.map((l) => (
                    <tr key={l.revistaId} className="border-b last:border-0">
                      <td className="py-1.5">{l.titulo}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{l.quantidade}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatarReais(l.valorCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">{resumo.revistas}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatarReais(resumo.totalCentavos)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Já recebido: {formatarReais(resumo.recebidoCentavos)} · a receber:{" "}
                {formatarReais(resumo.aReceberCentavos)}. O valor é o que as pessoas pagam à EBD; o preço do fornecedor
                pode ser outro.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {aba === "sem_pedido" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Quem está matriculado hoje e ainda não tem pedido neste trimestre.
          </p>
          {semPedido.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todos os matriculados já pediram.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {semPedido.map((s) => (
                <li key={s.membroId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {s.nome} <span className="text-muted-foreground">· {s.classeNome}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={revistas.length === 0}
                    onClick={() =>
                      setPedindo({ pessoa: { membroId: s.membroId, nome: s.nome, classeNome: s.classeNome } })
                    }
                  >
                    <Plus className="size-3.5" /> Fazer pedido
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {aba === "rede" && rede ? (
        <RedeDeRevistas
          trimestreId={trimestreId}
          trimestreNome={trimestre?.nome ?? ""}
          igreja={igreja}
          revistas={revistas}
          rede={rede}
        />
      ) : null}

      {aba === "revistas" && lista.propria ? (
        <RevistasDoTrimestre
          trimestreId={trimestreId}
          trimestreNome={trimestre?.nome ?? "trimestre"}
          revistas={revistas}
          classes={classes}
          outrosTrimestres={trimestres.filter((t) => t.id !== trimestreId)}
        />
      ) : null}

      {/* O que está à venda neste trimestre, no fim da tela: o foco aqui são os pedidos. */}
      {aba === "revistas" ? null : (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border p-3 print:hidden",
            revistas.length === 0 && "border-primary/50 bg-primary/5",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="size-4 text-primary" /> Revistas e preços deste trimestre
            </p>
            {lista.propria ? (
              <Button
                type="button"
                size="sm"
                variant={revistas.length === 0 ? "default" : "outline"}
                onClick={() => setAba("revistas")}
              >
                <Pencil className="size-3.5" />{" "}
                {revistas.length === 0 ? "Cadastrar revistas" : "Editar revistas e preços"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Definidos por {lista.donaNome}</span>
            )}
          </div>
          {revistas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lista.propria
                ? "Comece por aqui: cadastre as revistas que a EBD vai oferecer neste trimestre e o preço de cada uma. Depois é só registrar os pedidos."
                : `A lista de revistas deste trimestre ainda não foi cadastrada por ${lista.donaNome}.`}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {revistas.map((r) => (
                <li key={r.id} className="rounded-full border bg-background px-3 py-1 text-sm">
                  {r.titulo} <strong className="tabular-nums">{formatarReais(r.precoCentavos)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={pedindo !== null} onOpenChange={(aberto) => !aberto && setPedindo(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pedindo?.pedido ? "Alterar pedido" : "Novo pedido de revista"}</DialogTitle>
            <DialogDescription>{trimestre?.nome}</DialogDescription>
          </DialogHeader>
          {pedindo !== null ? (
            <PedidoForm
              trimestreId={trimestreId}
              revistas={revistas}
              pedido={pedindo.pedido}
              pessoaInicial={pedindo.pessoa}
              jaPediram={jaPediram}
              onFechar={() => setPedindo(null)}
              onEditarRevistas={
                lista.propria
                  ? () => {
                      setPedindo(null);
                      setAba("revistas");
                    }
                  : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pagando} onOpenChange={(aberto) => !aberto && setPagandoId(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pagamento de {pagando?.nome}</DialogTitle>
            <DialogDescription>
              {pagando?.itens.map((i) => `${i.quantidade} × ${i.titulo}`).join(", ")}
            </DialogDescription>
          </DialogHeader>
          {pagando ? <PagamentoForm pedido={pagando} hoje={hoje} onFechar={() => setPagandoId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}
