import type { OutfitAnalysis } from '../analysis/schemas/outfit-analysis.schema';
import { substringMatchScore } from '../recommendations/ranking/ranking.service';
import type { ClosetItem } from './closet.repository';

export type OutfitGarment = OutfitAnalysis['garments'][number];

export interface GarmentMatchResult {
  garment: OutfitGarment;
  matchedClosetItemId: string | null;
  status: 'owned' | 'missing';
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function matchGarmentsAgainstCloset(
  garments: OutfitGarment[],
  closetItems: ClosetItem[],
): GarmentMatchResult[] {
  return garments.map((garment) => {
    const match = closetItems.find((item) => {
      const sameCategory = normalize(item.category) === normalize(garment.category);
      if (!sameCategory) {
        return false;
      }
      // Mismo criterio de coincidencia de color que ranking.service.ts (exacto o substring
      // en cualquier dirección) - reutilizado en vez de duplicar la lógica.
      return substringMatchScore(garment.color, item.color) > 0;
    });

    return {
      garment,
      matchedClosetItemId: match?.id ?? null,
      status: match ? 'owned' : 'missing',
    };
  });
}
