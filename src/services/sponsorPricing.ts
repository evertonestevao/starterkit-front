import { AppError } from "@/lib/errors";

/**
 * Preço de patrocínio por POSIÇÃO, não por igreja.
 *
 * Regra: com N patrocínios cobráveis, o total é a soma dos tiers das posições
 * 1..N; a maior posição da tabela vale para todas as posições seguintes.
 * Cancelar ou adicionar uma igreja recalcula tudo do zero — o valor de uma
 * igreja nunca fica "preso" à posição que ela ocupou antes.
 *
 * A posição de cada igreja é só a forma de EXIBIR a divisão (e o snapshot da
 * cobrança): ordem em que o patrocinador escolheu as igrejas, empate
 * desempatado pelo id, para a ordem não mudar entre um acesso e outro.
 *
 * Tudo em centavos (inteiros): float somando 39,90 + 34,90 não é confiável.
 */

export interface PriceTier {
  position: number;
  amountCents: number;
}

export interface RankableSponsorship {
  id: string;
  /** Momento que define a ordem (created_at do patrocínio). */
  rankedAt: string;
}

export interface AllocatedSponsorship<T extends RankableSponsorship> {
  sponsorship: T;
  position: number;
  amountCents: number;
}

/** Valida e ordena a tabela. Tabela quebrada é erro de configuração, não do usuário. */
export function normalizeTiers(tiers: PriceTier[]): PriceTier[] {
  if (tiers.length === 0) {
    throw new AppError("internal_error", "Tabela de preços de patrocínio vazia");
  }

  const sorted = [...tiers].sort((a, b) => a.position - b.position);

  sorted.forEach((tier, index) => {
    // Posições contíguas a partir de 1: um buraco (1, 2, 4) deixaria a
    // posição 3 sem preço definido de forma ambígua.
    if (tier.position !== index + 1) {
      throw new AppError(
        "internal_error",
        "Tabela de preços de patrocínio com posições fora de sequência",
        { tiers },
      );
    }
    if (!Number.isInteger(tier.amountCents) || tier.amountCents <= 0) {
      throw new AppError(
        "internal_error",
        "Tabela de preços de patrocínio com valor inválido",
        { tiers },
      );
    }
  });

  return sorted;
}

/** Preço da posição N (1-based). Além da tabela, repete o último tier. */
export function priceForPosition(position: number, tiers: PriceTier[]): number {
  if (!Number.isInteger(position) || position < 1) {
    throw new AppError("internal_error", "Posição de patrocínio inválida", { position });
  }
  const sorted = normalizeTiers(tiers);
  const tier = sorted[Math.min(position, sorted.length) - 1];
  return tier.amountCents;
}

/** Total mensal para N patrocínios cobráveis. */
export function totalForCount(count: number, tiers: PriceTier[]): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new AppError("internal_error", "Quantidade de patrocínios inválida", { count });
  }
  let total = 0;
  for (let position = 1; position <= count; position += 1) {
    total += priceForPosition(position, tiers);
  }
  return total;
}

/** Quanto a PRÓXIMA igreja acrescentaria ao total atual. */
export function marginalPriceForNext(currentCount: number, tiers: PriceTier[]): number {
  return priceForPosition(currentCount + 1, tiers);
}

/**
 * Distribui os tiers pelos patrocínios cobráveis, na ordem estável. A soma dos
 * `amountCents` devolvidos é sempre `totalForCount(lista.length)`.
 */
export function allocatePositions<T extends RankableSponsorship>(
  sponsorships: T[],
  tiers: PriceTier[],
): AllocatedSponsorship<T>[] {
  const ordered = [...sponsorships].sort((a, b) => {
    const byTime = new Date(a.rankedAt).getTime() - new Date(b.rankedAt).getTime();
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return ordered.map((sponsorship, index) => ({
    sponsorship,
    position: index + 1,
    amountCents: priceForPosition(index + 1, tiers),
  }));
}

/** "R$ 39,90" — formatação única para tela e mensagens. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
