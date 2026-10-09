"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { useActionToast } from "@/hooks/useActionToast";
import { salvarVendaAction } from "@/server/actions/vendas";
import { formatCents } from "@/services/sponsorPricing";
import { OpcoesEditor } from "./opcoes-editor";
import type { Venda } from "@/types/vendas";

const textareaClasses =
  "min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/**
 * Criar ou editar uma venda. A chave Pix é de quem recebe (não é o caixa da
 * igreja) e só vale depois que o Responsável confirma pelo e-mail.
 */
export function VendaForm({ venda, hoje }: { venda?: Venda; hoje: string }) {
  const [state, action, pending] = useActionState(salvarVendaAction, undefined);
  useActionToast(state);
  const [preco, setPreco] = useState(venda ? formatCents(venda.precoCents) : "");
  const [pedeComprovante, setPedeComprovante] = useState(Boolean(venda?.whatsappComprovante));

  return (
    <form action={action} className="flex flex-col gap-4">
      {venda ? <input type="hidden" name="id" value={venda.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="titulo">O que está à venda</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          maxLength={120}
          defaultValue={venda?.titulo}
          placeholder="Camiseta do congresso de jovens"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <textarea
          id="descricao"
          name="descricao"
          maxLength={2000}
          rows={3}
          defaultValue={venda?.descricao ?? ""}
          placeholder="Tamanhos P, M, G e GG. Retirada no dia do congresso."
          className={textareaClasses}
        />
        <p className="text-xs text-muted-foreground">
          Se precisar, diga o que escrever na observação do pedido (ex.: nome para a camiseta).
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-48">
        <Label htmlFor="preco">Valor de cada unidade</Label>
        <Input
          id="preco"
          name="preco"
          required
          inputMode="decimal"
          value={preco}
          onChange={(e) => {
            // Cada dígito entra pela direita, como numa maquininha.
            const digitos = e.target.value.replace(/\D/g, "");
            setPreco(digitos ? formatCents(Number(digitos)) : "");
          }}
          placeholder="R$ 0,00"
        />
      </div>

      <OpcoesEditor temOpcoes={venda?.temOpcoes ?? false} opcoes={venda?.opcoes ?? []} />

      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Quem recebe o pagamento</legend>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          O dinheiro vai direto para esta chave, não para o caixa da igreja. Por segurança, a venda só aparece na
          página depois que o Responsável da igreja confirmar a chave (e o WhatsApp do comprovante, se houver) pelo
          link que vai para o e-mail dele. Trocar qualquer um dos dois depois pede uma nova confirmação.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pixChave">Chave Pix</Label>
            <Input
              id="pixChave"
              name="pixChave"
              required
              maxLength={140}
              defaultValue={venda?.pixChave}
              placeholder="CPF, e-mail, celular com +55 ou aleatória"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pixTitular">Nome de quem recebe</Label>
            <Input
              id="pixTitular"
              name="pixTitular"
              required
              maxLength={140}
              defaultValue={venda?.pixTitular}
              placeholder="Como aparece no banco"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={pedeComprovante}
            onChange={(e) => setPedeComprovante(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Quem compra deve enviar o comprovante pelo WhatsApp
            <span className="block text-xs text-muted-foreground">
              Depois do Pix aparece um botão que abre o WhatsApp deste número com uma mensagem pronta: nome,
              quantidade, total e a observação do pedido.
            </span>
          </span>
        </label>
        {pedeComprovante ? (
          <div className="flex flex-col gap-1.5 sm:max-w-64">
            <Label htmlFor="whatsappComprovante">WhatsApp para o comprovante</Label>
            <TelefoneInput
              id="whatsappComprovante"
              name="whatsappComprovante"
              required
              defaultValue={venda?.whatsappComprovante ?? ""}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Limites (opcionais)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="encerraEm">Aceitar pedidos até</Label>
            <Input id="encerraEm" name="encerraEm" type="date" min={hoje} defaultValue={venda?.encerraEm ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estoque">Estoque total</Label>
            <Input
              id="estoque"
              name="estoque"
              type="number"
              min={1}
              max={100000}
              inputMode="numeric"
              defaultValue={venda?.estoque ?? ""}
              placeholder="Sem limite"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxPorPedido">Máximo por pedido</Label>
            <Input
              id="maxPorPedido"
              name="maxPorPedido"
              type="number"
              min={1}
              max={1000}
              inputMode="numeric"
              defaultValue={venda?.maxPorPedido ?? ""}
              placeholder="Sem limite"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Na data escolhida, a página aceita pedidos até o fim do dia. Esgotado o estoque, para de aceitar sozinha
          (pedidos cancelados liberam as unidades).
        </p>
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : venda ? "Salvar alterações" : "Criar venda"}
      </Button>
    </form>
  );
}
