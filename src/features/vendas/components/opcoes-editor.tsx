"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODELOS_DE_OPCOES } from "@/lib/vendas";
import { formatCents } from "@/services/sponsorPricing";
import type { VendaOpcao } from "@/types/vendas";

interface Linha {
  /** Só para a lista da tela. */
  chave: string;
  /** Opção já gravada (null = nova). */
  id: string | null;
  nome: string;
  /** Texto do campo ("R$ 8,00"); vazio = o preço da venda. */
  preco: string;
}

let contador = 0;
const nova = (nome = "", id: string | null = null, preco = ""): Linha => ({ chave: `l${++contador}`, id, nome, preco });

/**
 * "Esta venda tem opções?" e, se tiver, a lista: sabores, tamanhos... Cada
 * opção pode ter preço próprio; vazio vale o preço da venda. Vai para o
 * servidor como JSON num campo escondido.
 */
export function OpcoesEditor({ temOpcoes, opcoes }: { temOpcoes: boolean; opcoes: VendaOpcao[] }) {
  const [ligado, setLigado] = useState(temOpcoes);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    opcoes.length > 0
      ? opcoes.map((o) => nova(o.nome, o.id, o.precoCents === null ? "" : formatCents(o.precoCents)))
      : [nova()],
  );

  const alterar = (chave: string, campo: "nome" | "preco", valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  /** O modelo substitui a lista inteira. Com opções já preenchidas, pergunta antes. */
  async function usarModelo(modelo: { nome: string; opcoes: string[] }) {
    if (linhas.some((l) => l.nome.trim())) {
      const sim = await confirmar({
        titulo: `Trocar as opções pelo modelo "${modelo.nome}"?`,
        descricao:
          "As opções da lista saem e entram as do modelo. Pedidos já feitos não mudam: as opções antigas continuam neles.",
        botao: "Trocar",
      });
      if (!sim) return;
    }
    setLinhas(modelo.opcoes.map((n) => nova(n)));
  }

  const json = JSON.stringify(
    linhas.filter((l) => l.nome.trim()).map((l) => ({ id: l.id, nome: l.nome.trim(), preco: l.preco })),
  );

  return (
    <fieldset id="opcoes-editor" tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <legend className="mb-1 text-sm font-medium">Esta venda tem opções (sabor, tamanho...)?</legend>
      <input type="hidden" name="temOpcoes" value={ligado ? "sim" : "nao"} />
      <input type="hidden" name="opcoes" value={ligado ? json : "[]"} />
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {[
          { valor: false, rotulo: "Não, um item só" },
          { valor: true, rotulo: "Sim, quem compra escolhe" },
        ].map((o) => (
          <label
            key={String(o.valor)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              ligado === o.valor ? "border-primary bg-primary/5 font-medium" : ""
            }`}
          >
            <input
              type="radio"
              name="temOpcoesEscolha"
              checked={ligado === o.valor}
              onChange={() => setLigado(o.valor)}
              className="accent-primary"
            />
            {o.rotulo}
          </label>
        ))}
      </div>

      {ligado ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Começar de um modelo:
            {MODELOS_DE_OPCOES.map((m) => (
              <Button key={m.nome} type="button" variant="outline" size="sm" onClick={() => usarModelo(m)}>
                {m.nome}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Quem compra escolhe a quantidade de cada opção, e o total soma tudo. Deixe o valor vazio para usar o valor
            da venda; preencha só nas que custam diferente (ex.: GG).
          </p>
          <ul className="flex flex-col gap-2">
            {linhas.map((l, i) => (
              <li key={l.chave} className="flex items-center gap-2">
                <Input
                  aria-label={`Nome da opção ${i + 1}`}
                  value={l.nome}
                  maxLength={80}
                  placeholder={i === 0 ? "Ex.: Carne" : "Outra opção"}
                  onChange={(e) => alterar(l.chave, "nome", e.target.value)}
                  className="flex-1"
                />
                <Input
                  aria-label={`Valor da opção ${i + 1}`}
                  value={l.preco}
                  inputMode="decimal"
                  placeholder="Mesmo valor"
                  onChange={(e) => {
                    const digitos = e.target.value.replace(/\D/g, "");
                    alterar(l.chave, "preco", digitos ? formatCents(Number(digitos)) : "");
                  }}
                  className="w-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Tirar a opção ${l.nome || i + 1}`}
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLinhas((ls) => [...ls, nova()])}>
            <Plus className="size-4" /> Acrescentar opção
          </Button>
          {opcoes.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Tirar uma opção não apaga os pedidos dela: eles continuam na lista e na planilha.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
