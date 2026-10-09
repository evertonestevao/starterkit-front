"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, Minus, Plus } from "lucide-react";
import { CamposAntiRobo } from "@/components/campos-anti-robo";
import { TelefoneInput } from "@/components/telefone-input";
import { CopyPix } from "@/features/church/components/copy-pix";
import { campo, rotulo } from "@/features/church/components/public-actions";
import { linkWhatsapp } from "@/lib/acompanhamento";
import { descreverItens, maximoParaPedir, mensagemDoComprovante } from "@/lib/vendas";
import { fazerPedidoVendaAction } from "@/server/actions/publicVendas";
import { formatCents } from "@/services/sponsorPricing";
import type { VendaPublica } from "@/types/vendas";

const botao =
  "flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] text-[var(--pg-text)] disabled:opacity-40";

/** − quantidade + */
function Contador({
  valor,
  podeMenos,
  podeMais,
  onMenos,
  onMais,
  rotuloItem,
}: {
  valor: number;
  podeMenos: boolean;
  podeMais: boolean;
  onMenos: () => void;
  onMais: () => void;
  rotuloItem: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onMenos} disabled={!podeMenos} aria-label={`Diminuir ${rotuloItem}`} className={botao}>
        <Minus className="size-4" />
      </button>
      <span className="min-w-7 text-center text-lg font-semibold tabular-nums" aria-live="polite">
        {valor}
      </span>
      <button type="button" onClick={onMais} disabled={!podeMais} aria-label={`Aumentar ${rotuloItem}`} className={botao}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/**
 * Pedido pela página da igreja. Sem opções, a pessoa escolhe a quantidade;
 * com opções (sabor, tamanho), escolhe a quantidade de cada uma. O total é
 * calculado na hora, e o Pix sai com ele embutido. O banco confere preço,
 * opções, estoque e limites de novo.
 */
export function PedidoVendaForm({ venda, whatsappHref }: { venda: VendaPublica; whatsappHref: string | null }) {
  const [state, action, pending] = useActionState(fazerPedidoVendaAction, undefined);
  // O "sucesso" traz o Pix (não é uma mensagem): só o erro vira aviso.
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  const maximo = maximoParaPedir(venda.maxPorPedido, venda.disponivel);
  const comOpcoes = venda.temOpcoes && venda.opcoes.length > 0;
  const [quantidade, setQuantidade] = useState(1);
  const [porOpcao, setPorOpcao] = useState<Record<string, number>>({});

  const unidades = comOpcoes ? Object.values(porOpcao).reduce((s, n) => s + n, 0) : quantidade;
  const total = comOpcoes
    ? venda.opcoes.reduce((s, o) => s + o.precoCents * (porOpcao[o.id] ?? 0), 0)
    : venda.precoCents * quantidade;
  const itensEscolhidos = venda.opcoes
    .filter((o) => (porOpcao[o.id] ?? 0) > 0)
    .map((o) => ({ opcaoId: o.id, nome: o.nome, quantidade: porOpcao[o.id] }));
  const mudar = (id: string, delta: number) =>
    setPorOpcao((atual) => ({ ...atual, [id]: Math.max(0, (atual[id] ?? 0) + delta) }));
  // Preço diferente em alguma opção: mostra o de cada linha.
  const precosVariam = new Set(venda.opcoes.map((o) => o.precoCents)).size > 1;

  if (state?.success) {
    // Venda que pede comprovante: botão com a mensagem pronta para o WhatsApp de quem organiza.
    const comprovante =
      state.success.whatsappComprovante && state.pedido
        ? linkWhatsapp(
            state.success.whatsappComprovante,
            mensagemDoComprovante({
              titulo: venda.titulo,
              nome: state.pedido.nome,
              quantidade: state.pedido.quantidade,
              itens: state.pedido.itens,
              totalFormatado: formatCents(state.success.totalCents),
              observacao: state.pedido.observacao,
            }),
          )
        : null;
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-[var(--pg-accent-soft)] p-4" role="status">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--pg-text)]">
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--pg-accent)]" aria-hidden />
          <span>
            Pedido anotado! Pague <strong>{formatCents(state.success.totalCents)}</strong> no Pix abaixo. O pagamento
            vai para <strong>{state.success.pixTitular}</strong>.
          </span>
        </p>
        <CopyPix
          chave={state.success.pixChave}
          copiaECola={state.success.pixCopiaECola}
          qrDataUrl={state.success.pixQrDataUrl}
        />
        {comprovante ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-6 text-[var(--pg-text)]">
              Depois de pagar, envie o comprovante para quem organiza. A mensagem já vai com o seu pedido: é só anexar
              o comprovante.
            </p>
            <a
              href={comprovante}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--pg-accent)] font-semibold text-[var(--pg-accent)]"
            >
              <MessageCircle className="size-4" aria-hidden />
              Enviar comprovante pelo WhatsApp
            </a>
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--pg-muted)]">
            Depois de pagar,{" "}
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--pg-accent)] underline underline-offset-4"
              >
                envie o comprovante pelo WhatsApp da igreja
              </a>
            ) : (
              "guarde o comprovante"
            )}
            . Quem organiza confere e confirma o seu pedido.
          </p>
        )}
      </div>
    );
  }

  const limites =
    venda.maxPorPedido !== null || venda.disponivel !== null ? (
      <span className="text-xs text-[var(--pg-muted)]">
        {venda.disponivel !== null ? `Restam ${venda.disponivel}. ` : ""}
        {venda.maxPorPedido !== null ? `Até ${venda.maxPorPedido} por pedido.` : ""}
      </span>
    ) : null;

  return (
    <form action={action} className="relative flex flex-col gap-3">
      <CamposAntiRobo />
      <input type="hidden" name="vendaId" value={venda.id} />
      <input type="hidden" name="quantidade" value={comOpcoes ? 0 : quantidade} />
      <input
        type="hidden"
        name="itens"
        value={JSON.stringify(itensEscolhidos.map((i) => ({ opcaoId: i.opcaoId, quantidade: i.quantidade })))}
      />
      <input type="hidden" name="itensTexto" value={comOpcoes ? descreverItens(itensEscolhidos) : ""} />

      {comOpcoes ? (
        <div className="flex flex-col gap-1.5">
          <span className={rotulo}>Escolha as quantidades</span>
          <ul className="flex flex-col divide-y divide-[var(--pg-border)] rounded-xl border border-[var(--pg-border)]">
            {venda.opcoes.map((o) => {
              const n = porOpcao[o.id] ?? 0;
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium break-words text-[var(--pg-text)]">{o.nome}</span>
                    {precosVariam ? (
                      <span className="block text-xs text-[var(--pg-muted)]">{formatCents(o.precoCents)}</span>
                    ) : null}
                  </span>
                  <Contador
                    valor={n}
                    podeMenos={n > 0}
                    podeMais={unidades < maximo}
                    onMenos={() => mudar(o.id, -1)}
                    onMais={() => mudar(o.id, 1)}
                    rotuloItem={o.nome}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between">
            {limites ?? <span />}
            <span className="text-right">
              <span className="block text-xs text-[var(--pg-muted)]">
                Total ({unidades} {unidades === 1 ? "unidade" : "unidades"})
              </span>
              <span className="text-xl font-bold text-[var(--pg-text)] tabular-nums">{formatCents(total)}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={rotulo}>Quantidade</span>
          <div className="flex items-center gap-3">
            <Contador
              valor={quantidade}
              podeMenos={quantidade > 1}
              podeMais={quantidade < maximo}
              onMenos={() => setQuantidade((q) => Math.max(1, q - 1))}
              onMais={() => setQuantidade((q) => Math.min(maximo, q + 1))}
              rotuloItem="quantidade"
            />
            <span className="ml-auto text-right">
              <span className="block text-xs text-[var(--pg-muted)]">Total</span>
              <span className="text-xl font-bold text-[var(--pg-text)] tabular-nums">{formatCents(total)}</span>
            </span>
          </div>
          {limites}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>Seu nome</span>
        <input name="nome" required autoComplete="name" maxLength={120} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>WhatsApp</span>
        <TelefoneInput semEstilo name="telefone" required className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>
          Observação <span className="font-normal text-[var(--pg-muted)]">(opcional)</span>
        </span>
        <textarea
          name="observacao"
          maxLength={500}
          rows={3}
          placeholder={comOpcoes ? "Algo mais que quem organiza precisa saber" : "Ex.: 2 tamanho G e 1 M"}
          className={`${campo} h-auto py-3`}
        />
      </label>

      <button
        type="submit"
        disabled={pending || unidades === 0}
        className="mt-1 h-12 w-full rounded-xl bg-[var(--pg-accent)] text-base font-semibold text-[var(--pg-accent-fg)] transition-opacity disabled:opacity-60"
      >
        {pending ? "Enviando..." : unidades === 0 ? "Escolha pelo menos um item" : `Gerar Pix de ${formatCents(total)}`}
      </button>
    </form>
  );
}
