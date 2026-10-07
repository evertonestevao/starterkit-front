import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cake, ChevronLeft, ChevronRight, Droplets, Heart, MessageCircle } from "lucide-react";
import { BotaoVoltar } from "@/components/botao-voltar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { hojeISO, linkWhatsapp } from "@/lib/acompanhamento";
import { MESES, TIPO_ANIVERSARIO_LABEL, descreverAnos, lerMes, mensagemParabens } from "@/lib/rolMembros";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { getSaudacaoAtiva } from "@/server/saudacao";
import type { TipoAniversario } from "@/types/acompanhamento";

export const metadata: Metadata = { title: "Aniversariantes" };

const ICONE: Record<TipoAniversario, typeof Cake> = { nascimento: Cake, batismo: Droplets, casamento: Heart };

const linkDoMes = (mes: number) => `/dashboard/membros/aniversariantes?mes=${mes}`;

export default async function AniversariantesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();

  const hoje = hojeISO();
  const mes = lerMes((await searchParams).mes, hoje);
  const [{ igreja, itens }, saudacao] = await Promise.all([
    (await getAcompanhamentoService()).aniversariantes(actor, mes),
    getSaudacaoAtiva(),
  ]);
  const ano = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));
  const diaDeHoje = mes === mesAtual ? Number(hoje.slice(8, 10)) : null;

  return (
    <div className="flex flex-col gap-4">
      <BotaoVoltar href="/dashboard/membros" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Aniversariantes de {MESES[mes - 1]}</h3>
          <p className="text-sm text-muted-foreground">
            Aniversário, batismo e casamento das pessoas ativas. O botão abre o WhatsApp com a mensagem pronta.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={linkDoMes(mes === 1 ? 12 : mes - 1)}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {mes !== mesAtual ? (
            <Link href={linkDoMes(mesAtual)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Este mês
            </Link>
          ) : null}
          <Link
            href={linkDoMes(mes === 12 ? 1 : mes + 1)}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ninguém com data comemorativa em {MESES[mes - 1]}. As datas vêm do cadastro (nascimento e batismo) e da ficha
          (casamento).
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {itens.map((a) => {
            const Icone = ICONE[a.tipo];
            const anos = descreverAnos(a, ano);
            const whatsapp = linkWhatsapp(a.whatsapp, mensagemParabens(a, igreja, saudacao));
            const eHoje = a.dia === diaDeHoje;
            return (
              <li
                key={`${a.membroId}-${a.tipo}`}
                className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${eHoje ? "bg-primary/5" : ""}`}
              >
                <span
                  className="flex w-10 shrink-0 flex-col items-center rounded-md border bg-background py-1 leading-none"
                  aria-label={`Dia ${a.dia}`}
                >
                  <span className="text-base font-semibold tabular-nums">{String(a.dia).padStart(2, "0")}</span>
                  <span className="text-[0.6rem] text-muted-foreground uppercase">{MESES[mes - 1].slice(0, 3)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/dashboard/membros/${a.membroId}`} className="font-medium hover:underline">
                      {a.nome}
                    </Link>
                    {eHoje ? <Badge>Hoje</Badge> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Icone className="size-3.5" aria-hidden />
                    {TIPO_ANIVERSARIO_LABEL[a.tipo]}
                    {a.tipo === "casamento" && a.conjugeNome ? ` com ${a.conjugeNome}` : ""}
                    {anos ? ` · ${anos}` : ""}
                  </span>
                </span>
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ size: "sm", variant: eHoje ? "default" : "outline" })}
                  >
                    <MessageCircle className="size-4" /> Parabenizar
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem telefone</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
