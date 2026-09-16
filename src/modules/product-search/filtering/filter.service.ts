import type { SearchResultWithStore } from '../product-search.service';
import type { Gender } from '../gender';
import { hasConflictingGenderSignal } from '../normalization/product-normalization.service';

export interface FilterConstraints {
  size?: string;
  budget?: number;
  gender: Gender;
  category: string;
}

// Igual criterio que hasConflictingGenderSignal(): solo descarta cuando el candidato tiene una
// categoría CLARA y distinta a la pedida (ej. "falda" pedida, candidato normalizado a "blusa").
// Si el candidato no tiene categoría normalizada (null - Shopify no siempre la resuelve), no se
// inventa una señal que no está ahí, se deja pasar y que el ranking de texto decida.
function hasConflictingCategorySignal(targetCategory: string, candidateCategory: string | null): boolean {
  if (!candidateCategory) {
    return false;
  }
  return candidateCategory.trim().toLowerCase() !== targetCategory.trim().toLowerCase();
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
    .filter((candidate) => !hasConflictingCategorySignal(constraints.category, candidate.category))
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
