import type { SearchResultWithStore } from '../product-search.service';
import type { Gender } from '../gender';
import { hasConflictingGenderSignal } from '../normalization/product-normalization.service';

export interface FilterConstraints {
  size?: string;
  budget?: number;
  gender: Gender;
}

// Restricciones DURAS (excluyen candidatos). budget NO filtra acá a propósito - un producto
// sobre presupuesto sigue siendo candidato, solo puntúa peor en el ranking.
export function filterCandidates(
  candidates: SearchResultWithStore[],
  constraints: FilterConstraints,
): SearchResultWithStore[] {
  const targetSize = constraints.size?.trim().toLowerCase();

  return candidates
    .filter((candidate) => candidate.availability)
    .filter((candidate) => !hasConflictingGenderSignal(constraints.gender, candidate))
    .map((candidate) => {
      if (!targetSize) {
        return candidate;
      }
      const matchingVariants = candidate.variants.filter(
        (variant) => variant.availability && variant.size?.trim().toLowerCase() === targetSize,
      );
      return { ...candidate, variants: matchingVariants };
    })
    .filter((candidate) => candidate.variants.length > 0);
}
