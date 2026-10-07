"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eye, RotateCcw } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarteirinhaVisual } from "@/features/carteirinha/components/carteirinha-visual";
import {
  CAMPOS_CARTEIRINHA,
  HEX_RE,
  LAYOUTS,
  PALETAS,
  RODAPE_MAX,
  TEXTO_VERSO_MAX,
  TITULO_MAX,
  claraDemais,
} from "@/lib/carteirinhaModelo";
import { cn } from "@/lib/utils";
import { restaurarCarteirinhaModeloAction, salvarCarteirinhaModeloAction } from "@/server/actions/carteirinha";
import type { CampoCarteirinha, Carteirinha, CarteirinhaModelo, LayoutCarteirinha } from "@/types/carteirinha";

/** Miniatura de cada desenho pronto, na cor escolhida: só as formas, sem texto. */
function Miniatura({ layout, cor }: { layout: LayoutCarteirinha; cor: string }) {
  const foto = <span className="h-7 w-5 shrink-0 rounded-sm bg-neutral-300" />;
  const linhas = (
    <span className="flex flex-1 flex-col gap-1">
      <span className="h-1.5 w-4/5 rounded-full bg-neutral-400" />
      <span className="h-1 w-3/5 rounded-full bg-neutral-300" />
      <span className="h-1 w-2/5 rounded-full bg-neutral-300" />
    </span>
  );
  return (
    <span
      className="flex h-14 w-full flex-col overflow-hidden rounded-md border border-neutral-300 bg-white"
      aria-hidden
    >
      {layout === "classico" ? <span className="h-3 shrink-0" style={{ backgroundColor: cor }} /> : null}
      {layout === "minimalista" ? <span className="h-1 shrink-0" style={{ backgroundColor: cor }} /> : null}
      {layout === "lateral" ? (
        <span className="flex flex-1">
          <span className="flex w-8 shrink-0 items-center justify-center" style={{ backgroundColor: cor }}>
            <span className="h-7 w-5 rounded-sm bg-white/85" />
          </span>
          <span className="flex flex-1 items-center p-1.5">{linhas}</span>
        </span>
      ) : (
        <span className="flex flex-1 items-center gap-1.5 p-1.5">
          {foto}
          {linhas}
        </span>
      )}
    </span>
  );
}

function CampoCor({
  id,
  rotulo,
  dica,
  valor,
  onMudar,
}: {
  id: string;
  rotulo: string;
  dica: string;
  valor: string;
  onMudar: (cor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={HEX_RE.test(valor) ? valor : "#000000"}
          onChange={(e) => onMudar(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <Input
          value={valor}
          onChange={(e) => onMudar(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-label={`${rotulo} em código (#rrggbb)`}
          aria-invalid={!HEX_RE.test(valor)}
          className="w-28 font-mono"
        />
      </div>
      <p className="text-xs text-muted-foreground">{dica}</p>
    </div>
  );
}

/**
 * Modelo da carteirinha da rede: desenho, cores, título, informações e
 * textos, com a prévia ao lado mudando a cada escolha. A prévia é o mesmo
 * componente da carteirinha de verdade.
 */
export function CarteirinhaModeloEditor({
  inicial,
  personalizado,
  temLogo,
  exemplo,
  qrSvg,
}: {
  inicial: CarteirinhaModelo;
  /** Já existe um modelo gravado (dá para restaurar o padrão). */
  personalizado: boolean;
  /** A igreja tem logo cadastrada (em Página da igreja). */
  temLogo: boolean;
  /** Membro de mentira, com todas as informações preenchidas. */
  exemplo: Carteirinha;
  qrSvg: string;
}) {
  const [modelo, setModelo] = useState<CarteirinhaModelo>(inicial);
  const [pending, start] = useTransition();
  const mudar = (parte: Partial<CarteirinhaModelo>) => setModelo((m) => ({ ...m, ...parte }));

  const coresValidas = HEX_RE.test(modelo.corPrimaria) && HEX_RE.test(modelo.corDestaque);
  const mudou = JSON.stringify(modelo) !== JSON.stringify(inicial);
  // A prévia só usa cores válidas: digitando o código pela metade, segura a última boa.
  const [ultimaBoa, setUltimaBoa] = useState(inicial);
  if (coresValidas && ultimaBoa !== modelo) setUltimaBoa(modelo);
  const naPrevia = coresValidas
    ? modelo
    : { ...modelo, corPrimaria: ultimaBoa.corPrimaria, corDestaque: ultimaBoa.corDestaque };

  function alternarCampo(campo: CampoCarteirinha, marcado: boolean) {
    const campos = marcado ? [...modelo.campos, campo] : modelo.campos.filter((c) => c !== campo);
    // Sempre na ordem do catálogo, para "mudou" não acusar só por ordem de clique.
    mudar({ campos: CAMPOS_CARTEIRINHA.map((c) => c.chave).filter((c) => campos.includes(c)) });
  }

  function salvar() {
    start(async () => {
      const r = await salvarCarteirinhaModeloAction({
        ...modelo,
        rodape: modelo.rodape ?? "",
        textoVerso: modelo.textoVerso ?? "",
      });
      // O aviso sai daqui: ao salvar, a página remonta este componente com o que ficou gravado.
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Modelo salvo.");
    });
  }

  async function restaurar() {
    const sim = await confirmar({
      titulo: "Voltar ao modelo padrão?",
      descricao: "O desenho, as cores e os textos escolhidos são descartados. Vale para todas as igrejas da rede.",
      botao: "Voltar ao padrão",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await restaurarCarteirinhaModeloAction();
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Voltou ao modelo padrão.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Modelo</legend>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Modelo da carteirinha">
            {LAYOUTS.map((l) => {
              const ativo = modelo.layout === l.chave;
              return (
                <button
                  key={l.chave}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => mudar({ layout: l.chave })}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                    ativo ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30",
                  )}
                >
                  <Miniatura layout={l.chave} cor={naPrevia.corPrimaria} />
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {l.nome}
                    {ativo ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{l.descricao}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Cores</legend>
          <div className="flex flex-wrap gap-2" aria-label="Combinações prontas">
            {PALETAS.map((p) => {
              const ativa = modelo.corPrimaria === p.corPrimaria && modelo.corDestaque === p.corDestaque;
              return (
                <button
                  key={p.nome}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => mudar({ corPrimaria: p.corPrimaria, corDestaque: p.corDestaque })}
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs",
                    ativa ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30",
                  )}
                >
                  <span className="size-5 rounded-full" style={{ backgroundColor: p.corPrimaria }} aria-hidden />
                  {p.nome}
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoCor
              id="cor-primaria"
              rotulo="Cor principal"
              dica="A faixa e o nome da igreja."
              valor={modelo.corPrimaria}
              onMudar={(corPrimaria) => mudar({ corPrimaria })}
            />
            <CampoCor
              id="cor-destaque"
              rotulo="Cor dos detalhes"
              dica="Os rótulos pequenos (título, validade)."
              valor={modelo.corDestaque}
              onMudar={(corDestaque) => mudar({ corDestaque })}
            />
          </div>
          {coresValidas && claraDemais(modelo.corPrimaria) ? (
            <p className="text-xs text-muted-foreground">
              Esta cor principal é clara: sobre ela o texto sai escuro, e onde ela seria usada para escrever no branco
              entra um cinza, para continuar legível.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cart-titulo">Título</Label>
          <Input
            id="cart-titulo"
            value={modelo.titulo}
            maxLength={TITULO_MAX}
            onChange={(e) => mudar({ titulo: e.target.value })}
            placeholder="Carteira de membro"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={modelo.mostrarLogo}
              onChange={(e) => mudar({ mostrarLogo: e.target.checked })}
            />
            Mostrar a logo da igreja
          </label>
          <p className="text-xs text-muted-foreground">
            {temLogo
              ? "É a logo de Configurações → Página da igreja. Cada igreja da rede usa a sua; a que não tiver usa a desta."
              : "Esta igreja ainda não tem logo. Envie em Configurações → Página da igreja e ela passa a aparecer aqui."}{" "}
            No PDF a logo precisa estar em PNG ou JPG.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Informações do membro</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CAMPOS_CARTEIRINHA.map((campo) => (
              <label key={campo.chave} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={modelo.campos.includes(campo.chave)}
                  onChange={(e) => alternarCampo(campo.chave, e.target.checked)}
                />
                {campo.rotulo}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Nome, foto, igreja, validade e Pastor sempre aparecem. Informação que o membro não tem preenchida na ficha
            simplesmente não sai na carteirinha dele.
          </p>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cart-rodape">Rodapé (opcional)</Label>
          <Input
            id="cart-rodape"
            value={modelo.rodape ?? ""}
            maxLength={RODAPE_MAX}
            onChange={(e) => mudar({ rodape: e.target.value || null })}
            placeholder="Ex.: Campo de Lins · CNPJ 00.000.000/0001-00"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cart-verso">Texto do verso (opcional)</Label>
          <Input
            id="cart-verso"
            value={modelo.textoVerso ?? ""}
            maxLength={TEXTO_VERSO_MAX}
            onChange={(e) => mudar({ textoVerso: e.target.value || null })}
            placeholder="Ex.: Esta carteira é pessoal e intransferível."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={pending || !mudou || !coresValidas || modelo.titulo.trim().length < 2}
            onClick={salvar}
          >
            {pending ? "Salvando..." : "Salvar modelo"}
          </Button>
          <a
            href="/dashboard/settings/carteirinha/exemplo"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Eye className="size-4" /> Ver exemplo em PDF
          </a>
          {personalizado ? (
            <Button type="button" variant="ghost" className="gap-2" disabled={pending} onClick={restaurar}>
              <RotateCcw className="size-4" /> Voltar ao padrão
            </Button>
          ) : null}
          {mudou ? (
            <span className="text-xs text-muted-foreground">O PDF de exemplo mostra o modelo já salvo.</span>
          ) : null}
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-sm font-medium">Prévia</p>
        <CarteirinhaVisual carteirinha={{ ...exemplo, modelo: naPrevia }} fotoUrl={null} qrSvg={qrSvg} />
        <p className="mt-2 text-xs text-muted-foreground">
          Com um membro de exemplo. É assim que o membro vê a carteirinha no celular; o PDF para imprimir segue o mesmo
          modelo, no tamanho de um cartão.
        </p>
      </div>
    </div>
  );
}
