import type { SearchResultWithStore } from './product-search.service';

export type PickedVariant = SearchResultWithStore['variants'][number];

export function pickBestVariant(
  candidate: SearchResultWithStore,
  constraints: { size?: string },
): PickedVariant | null {
  const availableVariants = candidate.variants.filter((variant) => variant.availability);
  if (availableVariants.length === 0) {
    return null;
  }

  if (constraints.size) {
    // filterCandidates ya debería haber dejado solo variantes de esta talla, pero no lo
    // asumimos acá - se vuelve a chequear por seguridad.
    const target = constraints.size.trim().toLowerCase();
    const sizeMatch = availableVariants.find(
      (variant) => variant.size?.trim().toLowerCase() === target,
    );
    return sizeMatch ?? null;
  }

  let cheapest = availableVariants[0];
  for (const variant of availableVariants) {
    if (variant.price !== null && (cheapest.price === null || variant.price < cheapest.price)) {
      cheapest = variant;
    }
  }
  return cheapest;
}
