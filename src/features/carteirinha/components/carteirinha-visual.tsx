import { UserRound } from "lucide-react";
import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_LABEL, codigoEmBlocos } from "@/lib/carteirinha";
import {
  cargosDaCarteirinha,
  claraDemais,
  corSobre,
  informacoesDaCarteirinha,
  logoDaCarteirinha,
  resolverModelo,
} from "@/lib/carteirinhaModelo";
import { formatChurchName } from "@/lib/churchName";
import { cn } from "@/lib/utils";
import type { Carteirinha } from "@/types/carteirinha";

/**
 * A carteirinha na tela, no modelo que a rede escolheu: desenho (clássico,
 * faixa lateral ou minimalista), cores, título, informações e textos. É o
 * mesmo componente na página do membro e na prévia da configuração — o que a
 * igreja vê ao editar é o que o membro recebe.
 *
 * `qrSvg` vem pronto do servidor (gerado pela lib de QR a partir do nosso
 * próprio endereço de verificação). As cores são do modelo, por isso entram
 * por `style`; o texto sobre a cor principal é calculado para dar leitura.
 */
export function CarteirinhaVisual({
  carteirinha: c,
  fotoUrl,
  qrSvg,
}: {
  carteirinha: Carteirinha;
  /** Endereço da foto, ou null se não há foto. */
  fotoUrl: string | null;
  qrSvg: string;
}) {
  const m = resolverModelo(c.modelo);
  const sobre = corSobre(m.corPrimaria);
  // Cor clara demais não serve para escrever no branco: cai num cinza escuro.
  const tinta = claraDemais(m.corPrimaria) ? "#374151" : m.corPrimaria;
  const rotulo = claraDemais(m.corDestaque) ? "#6b7280" : m.corDestaque;
  const igreja = formatChurchName(c.igreja, c.igrejaSobrenome);
  const cargos = cargosDaCarteirinha(c, m);
  const informacoes = informacoesDaCarteirinha(c, m);
  const valida = c.estado === "valida";
  const lateral = m.layout === "lateral";
  const logoUrl = logoDaCarteirinha(c, m);
  // Sobre um quadrado branco: a logo da igreja pode ter fundo transparente e cor parecida com a da faixa.
  const logo = logoUrl ? (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5">
      {/* Logo pública da igreja, de tamanho fixo e pequeno: o otimizador do Next não se aplica. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
    </span>
  ) : null;

  const foto = (
    <div
      className={cn(
        "flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400",
        lateral ? "border-2 border-white/80" : "border border-neutral-300",
      )}
    >
      {fotoUrl ? (
        // Imagem servida por um handler nosso, com checagem de acesso: o otimizador do Next não se aplica.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt={`Foto de ${c.nome}`} className="size-full object-cover" />
      ) : (
        <UserRound className="size-10" aria-label="Sem foto" />
      )}
    </div>
  );

  const dados = (
    <div className="min-w-0 flex-1">
      {lateral || m.layout === "minimalista" ? (
        <div className="flex items-center gap-2">
          {logo ? <span className="rounded-md border border-neutral-200">{logo}</span> : null}
          <p className="min-w-0 text-sm leading-tight font-semibold break-words" style={{ color: tinta }}>
            {igreja}
          </p>
        </div>
      ) : null}
      <p
        className={cn("text-[0.65rem] font-semibold tracking-wide uppercase", m.layout !== "classico" && "mt-1")}
        style={{ color: rotulo }}
      >
        {m.titulo}
      </p>
      <p className="mt-1.5 text-lg leading-tight font-semibold break-words text-neutral-900">{c.nome}</p>
      {cargos ? <p className="mt-0.5 text-sm text-neutral-600">{cargos}</p> : null}
      {informacoes.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {informacoes.map((i) => (
            <div key={i.rotulo} className="min-w-0">
              <dt className="text-[0.6rem] font-medium tracking-wide uppercase" style={{ color: rotulo }}>
                {i.rotulo}
              </dt>
              <dd className="truncate text-sm text-neutral-900">{i.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );

  return (
    // Fundo sempre branco: é um cartão, igual no tema claro e no escuro.
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-300 bg-white text-neutral-900 shadow-sm">
      {m.layout === "classico" ? (
        <div
          className="flex items-center justify-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: m.corPrimaria, color: sobre }}
        >
          {logo}
          <p className="min-w-0 text-sm leading-tight font-semibold break-words">{igreja}</p>
        </div>
      ) : null}
      {m.layout === "minimalista" ? <div className="h-1.5" style={{ backgroundColor: m.corPrimaria }} /> : null}

      {lateral ? (
        <div className="flex">
          <div className="flex shrink-0 items-center px-3 py-4" style={{ backgroundColor: m.corPrimaria }}>
            {foto}
          </div>
          <div className="flex min-w-0 flex-1 p-4">{dados}</div>
        </div>
      ) : (
        <div className="flex gap-4 p-4">
          {foto}
          {dados}
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-neutral-200 p-4">
        <div
          className="size-28 shrink-0 [&>svg]:size-full"
          role="img"
          aria-label="QR Code de verificação da carteirinha"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 text-sm">
          <p className="text-[0.6rem] font-medium tracking-wide uppercase" style={{ color: rotulo }}>
            Validade
          </p>
          <p className="font-semibold">{formatarData(c.validade)}</p>
          <p
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
              valida ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700",
            )}
          >
            {ESTADO_CARTEIRINHA_LABEL[c.estado]}
          </p>
          <p className="mt-2 font-mono text-[0.7rem] text-neutral-500">{codigoEmBlocos(c.codigo)}</p>
          {c.pastor ? <p className="mt-1 text-xs text-neutral-600">Pastor: {c.pastor}</p> : null}
        </div>
      </div>

      {m.textoVerso ? (
        <p className="border-t border-neutral-200 px-4 py-2 text-center text-xs text-neutral-600">{m.textoVerso}</p>
      ) : null}
      {m.rodape ? (
        m.layout === "minimalista" ? (
          <p
            className="border-t px-4 py-2 text-center text-xs font-medium"
            style={{ borderColor: tinta, color: tinta }}
          >
            {m.rodape}
          </p>
        ) : (
          <p
            className="px-4 py-2 text-center text-xs font-medium"
            style={{ backgroundColor: m.corPrimaria, color: sobre }}
          >
            {m.rodape}
          </p>
        )
      ) : null}
    </div>
  );
}
