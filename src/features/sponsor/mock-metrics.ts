/**
 * DADOS DE DEMONSTRAÇÃO da tela de métricas do patrocinador.
 *
 * Nada aqui vem do banco: a medição real depende de a página pública da
 * igreja registrar visitas, cliques e leituras de QR Code, o que ainda não
 * existe. Este arquivo é o contrato provisório — quando a telemetria entrar,
 * troque só a origem dos dados (um service), mantendo estes formatos, e a
 * tela continua funcionando.
 *
 * A tela SEMPRE rotula estes números como exemplo. Número inventado exibido
 * como se fosse medição real é pior do que não ter a tela.
 */

// `type` e não `interface`: só o alias ganha índice implícito, exigido pelos
// componentes de gráfico (Record<string, unknown>).
export type MonthlyAppearance = {
  month: string;
  appearances: number;
};

export type ChurchExposure = {
  church: string;
  appearances: number;
  clicks: number;
};

export interface TrafficSource {
  label: string;
  value: number;
}

export interface SponsorMetricsSample {
  /** Aparições da marca no período (30 dias). */
  appearances: number;
  /** Pessoas distintas que viram a marca. */
  reach: number;
  /** Cliques no perfil do patrocinador. */
  clicks: number;
  /** Variação percentual das aparições contra o período anterior. */
  appearancesTrendPercent: number;
  monthly: MonthlyAppearance[];
  byChurch: ChurchExposure[];
  sources: TrafficSource[];
}

export const SPONSOR_METRICS_SAMPLE: SponsorMetricsSample = {
  appearances: 4820,
  reach: 1930,
  clicks: 268,
  appearancesTrendPercent: 12,
  monthly: [
    { month: "Abr", appearances: 2870 },
    { month: "Mai", appearances: 3140 },
    { month: "Jun", appearances: 3520 },
    { month: "Jul", appearances: 3980 },
    { month: "Ago", appearances: 4310 },
    { month: "Set", appearances: 4820 },
  ],
  byChurch: [
    { church: "Igreja Esperança", appearances: 2450, clicks: 142 },
    { church: "Comunidade Betel", appearances: 1480, clicks: 79 },
    { church: "Igreja Vida Nova", appearances: 890, clicks: 47 },
  ],
  sources: [
    { label: "QR Code impresso", value: 2120 },
    { label: "Link direto", value: 1460 },
    { label: "Redes sociais", value: 840 },
    { label: "Busca", value: 400 },
  ],
};

/** Cliques ÷ aparições, em pontos percentuais com uma casa. */
export function clickRatePercent(sample: SponsorMetricsSample): number {
  if (sample.appearances === 0) return 0;
  return (sample.clicks / sample.appearances) * 100;
}
