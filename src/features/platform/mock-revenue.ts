import { totalForCount, type PriceTier } from "@/services/sponsorPricing";
import type { SponsorChargeStatus } from "@/types/sponsorship";

/**
 * AMOSTRA da receita da plataforma, para a Visão geral da moderação enquanto
 * a cobrança real não está ligada.
 *
 * Os números não são soltos: partem de uma distribuição fictícia de quantas
 * igrejas cada patrocinador apoia e passam pela MESMA regra de preço por
 * posição do sistema (`totalForCount`). Assim o total, o ticket médio e a
 * divisão por faixa batem entre si — um painel de amostra incoerente ensina
 * a desconfiar do painel real que vier depois.
 *
 * Nada aqui é lido do banco. Quando a cobrança real entrar, esta tela passa a
 * ler `sponsor_charges` e este arquivo vai embora.
 */

/** Mesma tabela da migration de patrocínio. */
const FAIXAS_DE_PRECO: PriceTier[] = [
  { position: 1, amountCents: 3990 },
  { position: 2, amountCents: 3490 },
  { position: 3, amountCents: 2990 },
  { position: 4, amountCents: 2790 },
];

/** Quantos patrocinadores apoiam N igrejas (fictício). */
const DISTRIBUICAO = [
  { igrejas: 1, patrocinadores: 48 },
  { igrejas: 2, patrocinadores: 17 },
  { igrejas: 3, patrocinadores: 6 },
  { igrejas: 4, patrocinadores: 4 },
] as const;

/** Crescimento relativo dos últimos 12 meses; o último é o mês corrente. */
const CURVA = [0.38, 0.42, 0.47, 0.51, 0.55, 0.61, 0.66, 0.72, 0.79, 0.86, 0.93, 1];

export interface RevenueBand {
  rotulo: string;
  patrocinadores: number;
  /** Receita mensal da faixa, já com o desconto por posição aplicado. */
  receitaCents: number;
  /** Participação no total, 0–100. */
  participacao: number;
}

export interface SampleCharge {
  patrocinador: string;
  igrejas: number;
  valorCents: number;
  /** Mesmos status da cobrança real, para reusar o mesmo badge. */
  situacao: Extract<SponsorChargeStatus, "paid" | "pending" | "overdue">;
  data: string;
}

export interface RevenueSample {
  recebidoNoMesCents: number;
  variacaoMesAnterior: number;
  patrocinadores: number;
  igrejasApoiadas: number;
  ticketMedioCents: number;
  emAbertoCents: number;
  faturasAtrasadas: number;
  porMes: Array<{ mes: string; recebido: number }>;
  faixas: RevenueBand[];
  ultimosPagamentos: SampleCharge[];
}

function rotuloFaixa(igrejas: number, ultima: boolean): string {
  if (ultima) return `${igrejas} ou mais igrejas`;
  return igrejas === 1 ? "1 igreja" : `${igrejas} igrejas`;
}

function rotuloMes(data: Date): string {
  const mes = data.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" });
  const ano = data.toLocaleDateString("pt-BR", { year: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${mes.replace(".", "")}/${ano}`;
}

export function buildRevenueSample(hoje: Date = new Date()): RevenueSample {
  const faixasBrutas = DISTRIBUICAO.map((d, i) => ({
    rotulo: rotuloFaixa(d.igrejas, i === DISTRIBUICAO.length - 1),
    patrocinadores: d.patrocinadores,
    receitaCents: d.patrocinadores * totalForCount(d.igrejas, FAIXAS_DE_PRECO),
    igrejas: d.igrejas * d.patrocinadores,
  }));

  const mensalCents = faixasBrutas.reduce((soma, f) => soma + f.receitaCents, 0);
  const patrocinadores = faixasBrutas.reduce((soma, f) => soma + f.patrocinadores, 0);

  const porMes = CURVA.map((fator, i) => {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - (CURVA.length - 1 - i), 1);
    // Reais, não centavos: é o que o eixo e a dica do gráfico mostram.
    return { mes: rotuloMes(data), recebido: Math.round(mensalCents * fator) / 100 };
  });

  const recebidoNoMes = porMes[porMes.length - 1].recebido;
  const mesAnterior = porMes[porMes.length - 2].recebido;

  const atrasadas = [totalForCount(1, FAIXAS_DE_PRECO), totalForCount(2, FAIXAS_DE_PRECO), totalForCount(1, FAIXAS_DE_PRECO)];

  const dia = (n: number) =>
    new Date(hoje.getTime() - n * 86_400_000).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

  return {
    recebidoNoMesCents: Math.round(recebidoNoMes * 100),
    variacaoMesAnterior: Math.round(((recebidoNoMes - mesAnterior) / mesAnterior) * 1000) / 10,
    patrocinadores,
    igrejasApoiadas: faixasBrutas.reduce((soma, f) => soma + f.igrejas, 0),
    ticketMedioCents: Math.round(mensalCents / patrocinadores),
    emAbertoCents: atrasadas.reduce((a, b) => a + b, 0),
    faturasAtrasadas: atrasadas.length,
    porMes,
    faixas: faixasBrutas.map(({ igrejas: _igrejas, ...faixa }) => ({
      ...faixa,
      participacao: Math.round((faixa.receitaCents / mensalCents) * 1000) / 10,
    })),
    ultimosPagamentos: [
      { patrocinador: "Farmácia São Lucas", igrejas: 3, valorCents: totalForCount(3, FAIXAS_DE_PRECO), situacao: "paid", data: dia(0) },
      { patrocinador: "Escola Caminho do Saber", igrejas: 1, valorCents: totalForCount(1, FAIXAS_DE_PRECO), situacao: "paid", data: dia(1) },
      { patrocinador: "Ótica Visão Clara", igrejas: 2, valorCents: totalForCount(2, FAIXAS_DE_PRECO), situacao: "pending", data: dia(1) },
      { patrocinador: "Construtora Alicerce", igrejas: 4, valorCents: totalForCount(4, FAIXAS_DE_PRECO), situacao: "paid", data: dia(2) },
      { patrocinador: "Lanchonete Bom Sabor", igrejas: 1, valorCents: totalForCount(1, FAIXAS_DE_PRECO), situacao: "overdue", data: dia(6) },
      { patrocinador: "Pet Shop Amigo Fiel", igrejas: 2, valorCents: totalForCount(2, FAIXAS_DE_PRECO), situacao: "paid", data: dia(3) },
    ],
  };
}
