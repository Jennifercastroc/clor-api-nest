import type { MissingGarment, SearchResultWithStore } from '../../product-search/product-search.service';
import { RANKING_WEIGHTS } from './ranking.config';

export interface RankingStoreInfo {
  isNational?: boolean;
}

export interface RankingConstraints {
  size?: string;
  budget?: number;
}

export interface ScoreResult {
  total: number;
  breakdown: Record<keyof typeof RANKING_WEIGHTS, number>;
}

function normalize(value: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function exactMatchScore(a: string | null, b: string | null): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) {
    return 0;
  }
  return na === nb ? 1 : 0;
}

export function substringMatchScore(a: string | null, b: string | null): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) {
    return 0;
  }
  if (na === nb) {
    return 1;
  }
  return na.includes(nb) || nb.includes(na) ? 0.5 : 0;
}

function cheapestAvailablePrice(candidate: SearchResultWithStore): number | null {
  const prices = candidate.variants
    .filter((variant) => variant.availability && variant.price !== null)
    .map((variant) => variant.price as number);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function priceCompatibilityScore(candidate: SearchResultWithStore, budget?: number): number {
  if (budget === undefined) {
    return 1;
  }

  const price = cheapestAvailablePrice(candidate);
  if (price === null) {
    // No hay ninguna variante disponible con precio conocido - no podemos confirmar que
    // sea compatible con el presupuesto, así que no le regalamos el score neutral.
    return 0;
  }

  if (price <= budget) {
    return 1;
  }

  if (budget <= 0) {
    return 0;
  }

  const upperBound = budget * 1.5;
  if (price >= upperBound) {
    return 0;
  }

  return 1 - (price - budget) / (upperBound - budget);
}

function sizeAvailabilityScore(candidate: SearchResultWithStore, size?: string): number {
  if (!size) {
    return 1;
  }
  const target = size.trim().toLowerCase();
  return candidate.variants.some(
    (variant) => variant.availability && variant.size?.trim().toLowerCase() === target,
  )
    ? 1
    : 0;
}

function nationalProximityScore(store?: RankingStoreInfo): number {
  return store?.isNational === false ? 0 : 1;
}

export function scoreCandidate(
  candidate: SearchResultWithStore,
  garment: MissingGarment,
  store: RankingStoreInfo | undefined,
  constraints: RankingConstraints,
): ScoreResult {
  const factorScores: Record<keyof typeof RANKING_WEIGHTS, number> = {
    categoryMatch: exactMatchScore(candidate.category, garment.category),
    colorMatch: substringMatchScore(candidate.color, garment.color),
    styleMatch: substringMatchScore(candidate.style, garment.style),
    priceCompatibility: priceCompatibilityScore(candidate, constraints.budget),
    sizeAvailability: sizeAvailabilityScore(candidate, constraints.size),
    nationalProximity: nationalProximityScore(store),
  };

  const breakdown = {} as Record<keyof typeof RANKING_WEIGHTS, number>;
  let total = 0;

  for (const key of Object.keys(RANKING_WEIGHTS) as Array<keyof typeof RANKING_WEIGHTS>) {
    const weighted = factorScores[key] * RANKING_WEIGHTS[key];
    breakdown[key] = weighted;
    total += weighted;
  }

  return { total, breakdown };
}

export interface RankedCandidate extends SearchResultWithStore {
  score: number;
  scoreBreakdown: Record<keyof typeof RANKING_WEIGHTS, number>;
}

export function rankCandidates(
  candidates: SearchResultWithStore[],
  garment: MissingGarment,
  storesById: Record<string, RankingStoreInfo>,
  constraints: RankingConstraints,
): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const { total, breakdown } = scoreCandidate(
        candidate,
        garment,
        storesById[candidate.storeId],
        constraints,
      );
      return { ...candidate, score: total, scoreBreakdown: breakdown };
    })
    .sort((a, b) => b.score - a.score);
}
