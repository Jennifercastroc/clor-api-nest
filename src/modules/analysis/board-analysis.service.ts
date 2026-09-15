import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PRODUCT_CATALOG_REPOSITORY,
  type ProductCatalogRepository,
} from '../../common/supabase/product-catalog.repository.interface';
import { ProductSearchService, type MissingGarment } from '../product-search/product-search.service';
import { filterCandidates } from '../product-search/filtering/filter.service';
import { pickBestVariant } from '../product-search/pick-best-variant';
import {
  rankCandidates,
  type RankedCandidate,
  type RankingStoreInfo,
} from '../recommendations/ranking/ranking.service';
import { normalizeCategory } from '../product-search/normalization/product-normalization.service';
import type { Gender } from '../product-search/gender';
import { AzureOpenAiClient } from './azure-openai.client';
import {
  VisualRerankService,
  type VisualRerankReferenceImage,
  type VisualRerankResult,
} from './visual-rerank.service';
import { TOP_N_FOR_VISUAL_RERANK, VISUAL_MATCH_THRESHOLD } from './visual-rerank.constants';

interface BoardConstraints {
  size?: string;
  budget?: number;
  gender: Gender;
}

// Una categoría cuenta como "esencial" si aparece en al menos este % de las imágenes del
// tablero (basado en imágenes distintas, no en conteo total de prendas).
const ESSENTIAL_CATEGORY_THRESHOLD = 0.3;
// No mostrar más de esta cantidad de categorías esenciales, aunque más califiquen.
const MAX_ESSENTIAL_CATEGORIES = 5;
// Un accesorio se le manda a la IA como "candidato a destacar" solo si aparece en al menos
// este % de las imágenes - la decisión de umbral queda en código, no en el criterio del LLM.
const ACCESSORY_INSIGHT_THRESHOLD = 0.4;
const TOP_N_BOARD_RECOMMENDATIONS = 3;
// Máximo de índices de imagen de ejemplo por categoría esencial.
const MAX_EXAMPLE_IMAGES_PER_CATEGORY = 3;

interface TaggedGarment {
  imageIndex: number;
  category: string;
  color: string;
  style: string;
  material: string;
  pattern: string;
}

interface TaggedAccessory {
  imageIndex: number;
  category: string;
}

// Agregado interno de una categoría esencial - exampleImageIndexes acá todavía son índices
// del array ORIGINAL de imágenes subidas (0..N-1 en el orden del upload), no los índices
// finales de `images[]` en la respuesta - ese remapeo pasa al final de analyzeBoard.
interface EssentialCategoryAggregate {
  categoryKey: string;
  category: string;
  color: string;
  style: string;
  material: string;
  pattern: string;
  imageFrequency: number;
  exampleImageIndexes: number[];
}

export interface BoardRecommendationOutput {
  productName: string | null;
  price: number | null;
  imageUrl: string | null;
  storeUrl: string | null;
  score: number;
  scoreBreakdown: Record<string, number | string>;
}

export interface EssentialCategoryOutput {
  category: string;
  color: string;
  material: string;
  pattern: string;
  style: string;
  imageFrequency: number;
  specificDescription: string;
  // Índices dentro de `images[]` en ESTA respuesta, NO la posición original de subida.
  exampleImageIndexes: number[];
  recommendations: BoardRecommendationOutput[];
}

export interface AnalyzeBoardResponse {
  imagesAnalyzed: number;
  images: string[];
  styleNarrative: string;
  accessoryRecommendation: string;
  essentialCategories: EssentialCategoryOutput[];
}

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function groupGarmentsByCategory(
  garments: TaggedGarment[],
  totalImages: number,
): EssentialCategoryAggregate[] {
  const groups = new Map<
    string,
    { imagesSeen: Set<number>; colors: string[]; styles: string[]; materials: string[]; patterns: string[] }
  >();

  for (const garment of garments) {
    const rawCategory = garment.category.trim();
    // Pasamos rawCategory también como `name` porque normalizeCategory descarta el texto
    // original cuando isCrypticCategory lo marca como path (ej. "vestido / top y falda en
    // una sola pieza" contiene "/" y se trata como críptico) - así el heurístico de keywords
    // igual tiene contra qué matchear. Si no matchea nada, caemos al trim/lowercase de antes.
    const key =
      normalizeCategory({ category: rawCategory, name: rawCategory, rawTags: [] }) ??
      rawCategory.toLowerCase();
    const group = groups.get(key) ?? {
      imagesSeen: new Set<number>(),
      colors: [],
      styles: [],
      materials: [],
      patterns: [],
    };
    group.imagesSeen.add(garment.imageIndex);
    group.colors.push(garment.color);
    group.styles.push(garment.style);
    group.materials.push(garment.material);
    group.patterns.push(garment.pattern);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([categoryKey, group]) => ({
    categoryKey,
    category: categoryKey,
    color: mostFrequent(group.colors),
    style: mostFrequent(group.styles),
    material: mostFrequent(group.materials),
    pattern: mostFrequent(group.patterns),
    imageFrequency: group.imagesSeen.size / totalImages,
    exampleImageIndexes: Array.from(group.imagesSeen)
      .sort((a, b) => a - b)
      .slice(0, MAX_EXAMPLE_IMAGES_PER_CATEGORY),
  }));
}

function groupAccessoriesByCategory(
  accessories: TaggedAccessory[],
  totalImages: number,
): Array<{ category: string; imageFrequency: number }> {
  const groups = new Map<string, Set<number>>();

  for (const accessory of accessories) {
    const key = accessory.category.trim().toLowerCase();
    const imagesSeen = groups.get(key) ?? new Set<number>();
    imagesSeen.add(accessory.imageIndex);
    groups.set(key, imagesSeen);
  }

  return Array.from(groups.entries()).map(([category, imagesSeen]) => ({
    category,
    imageFrequency: imagesSeen.size / totalImages,
  }));
}

@Injectable()
export class BoardAnalysisService {
  private readonly logger = new Logger(BoardAnalysisService.name);

  constructor(
    private readonly azureOpenAiClient: AzureOpenAiClient,
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly productCatalogRepository: ProductCatalogRepository,
    private readonly productSearchService: ProductSearchService,
    private readonly visualRerankService: VisualRerankService,
  ) {}

  async analyzeBoard(
    images: Buffer[],
    mimeTypes: string[],
    _userId: string,
    constraints: BoardConstraints,
  ): Promise<AnalyzeBoardResponse> {
    // Independientes entre sí - una sola imagen ya tarda varios segundos, serial con hasta
    // MAX_BOARD_IMAGES sería inaceptable.
    const analyses = await Promise.all(
      images.map((image, index) =>
        this.azureOpenAiClient.analyzeOutfitImage(image.toString('base64'), mimeTypes[index]),
      ),
    );

    const totalImages = images.length;

    const taggedGarments: TaggedGarment[] = analyses.flatMap((analysis, imageIndex) =>
      analysis.garments.map((garment) => ({
        imageIndex,
        category: garment.category,
        color: garment.color,
        style: garment.style,
        material: garment.material,
        pattern: garment.pattern,
      })),
    );

    const taggedAccessories: TaggedAccessory[] = analyses.flatMap((analysis, imageIndex) =>
      analysis.accessories_detected.map((accessory) => ({
        imageIndex,
        category: accessory.category,
      })),
    );

    const essentialAggregates = groupGarmentsByCategory(taggedGarments, totalImages)
      .filter((group) => group.imageFrequency >= ESSENTIAL_CATEGORY_THRESHOLD)
      .sort((a, b) => b.imageFrequency - a.imageFrequency)
      .slice(0, MAX_ESSENTIAL_CATEGORIES);

    const accessoryCandidates = groupAccessoriesByCategory(taggedAccessories, totalImages).filter(
      (group) => group.imageFrequency >= ACCESSORY_INSIGHT_THRESHOLD,
    );

    // La síntesis de estilo (texto) y el ranking por texto de recomendaciones (tiendas) son
    // independientes entre sí - se corren en paralelo para no sumar sus latencias. El re-rank
    // VISUAL sí necesita specificDescription (que sale de styleProfile), así que va como un
    // tercer paso después de que ambas ramas resuelvan - no se puede paralelizar con la síntesis.
    const [styleProfile, rankedByCategory] = await Promise.all([
      this.azureOpenAiClient.synthesizeStyleProfile({
        totalImages,
        essentialCategories: essentialAggregates.map((e) => ({
          categoryKey: e.categoryKey,
          category: e.category,
          color: e.color,
          material: e.material,
          pattern: e.pattern,
          style: e.style,
          imageFrequency: e.imageFrequency,
        })),
        accessoryCandidates,
      }),
      this.rankAllEssentials(essentialAggregates, constraints),
    ]);

    const descriptionByKey = new Map(
      styleProfile.essentialDescriptions.map((d) => [d.categoryKey, d.specificDescription]),
    );

    const recommendationsByCategory = await this.applyVisualRerankToAllEssentials(
      essentialAggregates,
      rankedByCategory,
      descriptionByKey,
      images,
      mimeTypes,
      constraints,
    );

    // Remapeo de índices: solo se embeben las imágenes que al menos una categoría esencial
    // referencia (dedup), y cada exampleImageIndexes se reescribe para apuntar a la posición
    // dentro de ESTE array `images[]`, no a la posición original de subida. Mezclar ambos
    // sistemas de índices es la fuente de bug más obvia acá - de ahí este comentario largo.
    const referencedOriginalIndexes = Array.from(
      new Set(essentialAggregates.flatMap((e) => e.exampleImageIndexes)),
    ).sort((a, b) => a - b);

    const originalToResponseIndex = new Map(
      referencedOriginalIndexes.map((originalIndex, responseIndex) => [originalIndex, responseIndex]),
    );

    const responseImages = referencedOriginalIndexes.map(
      (originalIndex) => `data:${mimeTypes[originalIndex]};base64,${images[originalIndex].toString('base64')}`,
    );

    const essentialCategories: EssentialCategoryOutput[] = essentialAggregates.map((aggregate) => ({
      category: aggregate.category,
      color: aggregate.color,
      material: aggregate.material,
      pattern: aggregate.pattern,
      style: aggregate.style,
      imageFrequency: aggregate.imageFrequency,
      specificDescription: descriptionByKey.get(aggregate.categoryKey) ?? aggregate.category,
      exampleImageIndexes: aggregate.exampleImageIndexes.map(
        (originalIndex) => originalToResponseIndex.get(originalIndex)!,
      ),
      recommendations: recommendationsByCategory.get(aggregate.categoryKey) ?? [],
    }));

    return {
      imagesAnalyzed: totalImages,
      images: responseImages,
      styleNarrative: styleProfile.styleNarrative,
      accessoryRecommendation: styleProfile.accessoryRecommendation,
      essentialCategories,
    };
  }

  private async rankAllEssentials(
    essentials: EssentialCategoryAggregate[],
    constraints: BoardConstraints,
  ): Promise<Map<string, RankedCandidate[]>> {
    if (essentials.length === 0) {
      return new Map();
    }

    const stores = await this.productCatalogRepository.getActiveStores();
    const storesById: Record<string, RankingStoreInfo> = Object.fromEntries(
      stores.map((store) => [
        store.id,
        { isNational: store.isNational, styleTags: store.styleTags, isVersatile: store.isVersatile },
      ]),
    );

    const results = await Promise.all(
      essentials.map(async (essential) => {
        const ranked = await this.rankEssential(essential, storesById, constraints);
        return [essential.categoryKey, ranked] as const;
      }),
    );

    return new Map(results);
  }

  private async rankEssential(
    essential: EssentialCategoryAggregate,
    storesById: Record<string, RankingStoreInfo>,
    constraints: BoardConstraints,
  ): Promise<RankedCandidate[]> {
    try {
      const missingGarment: MissingGarment = {
        category: essential.category,
        color: essential.color,
        style: essential.style,
        gender: constraints.gender,
      };

      const rawCandidates = await this.productSearchService.searchForMissingGarment(missingGarment);
      const filtered = filterCandidates(rawCandidates, { ...constraints, category: essential.category });

      if (filtered.length === 0) {
        return [];
      }

      const ranked = rankCandidates(filtered, missingGarment, storesById, constraints);
      // Se guardan hasta TOP_N_FOR_VISUAL_RERANK - es lo máximo que la pasada visual va a
      // comparar de todas formas, no hace falta cargar más candidatos que eso.
      return ranked.slice(0, TOP_N_FOR_VISUAL_RERANK);
    } catch (error) {
      this.logger.warn(`Failed to rank essential "${essential.category}": ${String(error)}`);
      return [];
    }
  }

  private async applyVisualRerankToAllEssentials(
    essentials: EssentialCategoryAggregate[],
    rankedByCategory: Map<string, RankedCandidate[]>,
    descriptionByKey: Map<string, string>,
    images: Buffer[],
    mimeTypes: string[],
    constraints: BoardConstraints,
  ): Promise<Map<string, BoardRecommendationOutput[]>> {
    const results = await Promise.all(
      essentials.map(async (essential) => {
        const ranked = rankedByCategory.get(essential.categoryKey) ?? [];
        const recommendations = await this.applyVisualRerank(
          essential,
          ranked,
          descriptionByKey.get(essential.categoryKey),
          images,
          mimeTypes,
          constraints,
        );
        return [essential.categoryKey, recommendations] as const;
      }),
    );

    return new Map(results);
  }

  private async applyVisualRerank(
    essential: EssentialCategoryAggregate,
    ranked: RankedCandidate[],
    specificDescription: string | undefined,
    images: Buffer[],
    mimeTypes: string[],
    constraints: BoardConstraints,
  ): Promise<BoardRecommendationOutput[]> {
    if (ranked.length === 0) {
      return [];
    }

    // Máximo 2 imágenes de referencia por costo/latencia, tomadas de las imágenes ORIGINALES
    // (Buffers en memoria), no de las ya recortadas/embebidas para la respuesta.
    const referenceImages: VisualRerankReferenceImage[] = essential.exampleImageIndexes
      .slice(0, 2)
      .map((originalIndex) => ({
        base64: images[originalIndex].toString('base64'),
        mimeType: mimeTypes[originalIndex],
      }));

    const visualResults = await this.visualRerankService.rerankByVisualSimilarity(
      referenceImages,
      {
        category: essential.category,
        color: essential.color,
        style: essential.style,
        pattern: essential.pattern,
        description: specificDescription,
      },
      ranked.map((candidate) => ({ imageUrl: candidate.imageUrl })),
    );

    let finalCandidates: Array<{ candidate: RankedCandidate; visual?: VisualRerankResult }>;

    if (visualResults.length === 0) {
      // Fallback seguro: la pasada visual falló o no había imágenes de referencia/candidatos
      // comparables - se usa el orden de ranking de texto tal cual.
      finalCandidates = ranked.slice(0, TOP_N_BOARD_RECOMMENDATIONS).map((candidate) => ({ candidate }));
    } else {
      const visualByIndex = new Map(visualResults.map((v) => [v.candidateIndex, v]));
      finalCandidates = ranked
        .map((candidate, index) => ({ candidate, visual: visualByIndex.get(index) }))
        .filter(
          (entry): entry is { candidate: RankedCandidate; visual: VisualRerankResult } =>
            entry.visual !== undefined && entry.visual.visualMatchScore >= VISUAL_MATCH_THRESHOLD,
        )
        .sort((a, b) => b.visual.visualMatchScore - a.visual.visualMatchScore)
        .slice(0, TOP_N_BOARD_RECOMMENDATIONS);
    }

    const recommendations: BoardRecommendationOutput[] = [];
    for (const { candidate, visual } of finalCandidates) {
      const picked = pickBestVariant(candidate, { size: constraints.size });
      if (!picked) {
        continue;
      }

      const scoreBreakdown: Record<string, number | string> = { ...candidate.scoreBreakdown };
      if (visual) {
        scoreBreakdown.visualMatchScore = visual.visualMatchScore;
        scoreBreakdown.reason = visual.reason;
      }

      recommendations.push({
        productName: candidate.name,
        price: picked.price,
        imageUrl: candidate.imageUrl,
        storeUrl: candidate.url,
        score: candidate.score,
        scoreBreakdown,
      });
    }

    return recommendations;
  }
}
