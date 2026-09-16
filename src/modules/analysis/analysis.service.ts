import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_CLIENT } from '../../common/supabase/supabase-service-client.provider';
import {
  PRODUCT_CATALOG_REPOSITORY,
  type ProductCatalogRepository,
} from '../../common/supabase/product-catalog.repository.interface';
import { CLOSET_REPOSITORY, type ClosetRepository } from '../closet/closet.repository';
import { matchGarmentsAgainstCloset, type OutfitGarment } from '../closet/closet-matching.service';
import { ProductSearchService, type MissingGarment } from '../product-search/product-search.service';
import { filterCandidates } from '../product-search/filtering/filter.service';
import type { Gender } from '../product-search/gender';
import { pickBestVariant } from '../product-search/pick-best-variant';
import { rankCandidates, type RankingStoreInfo } from '../recommendations/ranking/ranking.service';
import { AzureOpenAiClient } from './azure-openai.client';
import { AnalyzeOutfitDto } from './dto/analyze-outfit.dto';
import { VisualRerankService, type VisualRerankResult } from './visual-rerank.service';
import { ALLOWED_MIME_TYPES } from './allowed-mime-types';
import { TOP_N_FOR_VISUAL_RERANK, VISUAL_MATCH_THRESHOLD } from './visual-rerank.constants';

const TOP_N_RECOMMENDATIONS = 3;

export interface RecommendationOutput {
  productVariantId: string;
  score: number;
  scoreBreakdown: Record<string, number | string>;
  productName: string | null;
  storeUrl: string | null;
  price: number | null;
  imageUrl: string | null;
}

export interface OutfitItemOutput {
  outfitItemId: string;
  category: string;
  color: string;
  pattern: string;
  material: string;
  style: string;
  status: 'owned' | 'missing';
  matchedClosetItemId: string | null;
  recommendations: RecommendationOutput[];
}

interface PersistedOutfitItem {
  id: string;
  garment: OutfitGarment;
  status: 'owned' | 'missing';
  matchedClosetItemId: string | null;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly azureOpenAiClient: AzureOpenAiClient,
    @Inject(SUPABASE_SERVICE_CLIENT) private readonly supabase: SupabaseClient,
    @Inject(CLOSET_REPOSITORY) private readonly closetRepository: ClosetRepository,
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly productCatalogRepository: ProductCatalogRepository,
    private readonly productSearchService: ProductSearchService,
    private readonly visualRerankService: VisualRerankService,
  ) {}

  async analyzeOutfit(file: Express.Multer.File, dto: AnalyzeOutfitDto, userId: string) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only image/jpeg and image/png files are supported');
    }

    const imageBase64 = file.buffer.toString('base64');
    const analysis = await this.azureOpenAiClient.analyzeOutfitImage(imageBase64, file.mimetype);

    const outfitAnalysisId = await this.persistOutfitAnalysis(userId, analysis);

    const closetItems = await this.closetRepository.listByUser(userId);
    const matches = matchGarmentsAgainstCloset(analysis.garments, closetItems);

    const outfitItems = await this.persistOutfitItems(outfitAnalysisId, userId, matches);

    const stores = await this.productCatalogRepository.getActiveStores();
    const storesById: Record<string, RankingStoreInfo> = Object.fromEntries(
      stores.map((store) => [
        store.id,
        { isNational: store.isNational, styleTags: store.styleTags, isVersatile: store.isVersatile },
      ]),
    );

    const items: OutfitItemOutput[] = await Promise.all(
      outfitItems.map((item) =>
        this.buildOutfitItemOutput(item, userId, dto, storesById, imageBase64, file.mimetype),
      ),
    );

    return {
      analysis,
      outfitAnalysisId,
      items,
    };
  }

  private async persistOutfitAnalysis(userId: string, analysis: unknown): Promise<string> {
    // outfit_analyses no tiene columna input_constraints en el schema real - no se inventa,
    // los constraints del request (city/budget/size) solo se usan en memoria para esta
    // corrida (filtro/ranking), no se persisten en esta tabla.
    const { data, error } = await this.supabase
      .from('outfit_analyses')
      .insert({
        user_id: userId,
        source_type: 'image',
        source_url: null,
        analysis_json: analysis,
      })
      .select('id')
      .single();

    if (error || !data) {
      this.logger.warn(`Failed to persist outfit_analyses: ${error?.message}`);
      throw new InternalServerErrorException('Failed to save outfit analysis');
    }

    return data.id as string;
  }

  private async persistOutfitItems(
    outfitAnalysisId: string,
    userId: string,
    matches: ReturnType<typeof matchGarmentsAgainstCloset>,
  ): Promise<PersistedOutfitItem[]> {
    const results: PersistedOutfitItem[] = [];

    for (const match of matches) {
      const { data, error } = await this.supabase
        .from('outfit_items')
        .insert({
          outfit_analysis_id: outfitAnalysisId,
          user_id: userId,
          category: match.garment.category,
          color: match.garment.color,
          pattern: match.garment.pattern,
          material: match.garment.material,
          style: match.garment.style,
          formality: null,
          description: null,
          matched_closet_item_id: match.matchedClosetItemId,
          status: match.status,
        })
        .select('id')
        .single();

      if (error || !data) {
        this.logger.warn(`Failed to persist outfit_item for "${match.garment.category}": ${error?.message}`);
        continue;
      }

      results.push({
        id: data.id as string,
        garment: match.garment,
        status: match.status,
        matchedClosetItemId: match.matchedClosetItemId,
      });
    }

    return results;
  }

  private async buildOutfitItemOutput(
    item: PersistedOutfitItem,
    userId: string,
    dto: AnalyzeOutfitDto,
    storesById: Record<string, RankingStoreInfo>,
    originalImageBase64: string,
    originalMimeType: string,
  ): Promise<OutfitItemOutput> {
    const base = {
      outfitItemId: item.id,
      category: item.garment.category,
      color: item.garment.color,
      pattern: item.garment.pattern,
      material: item.garment.material,
      style: item.garment.style,
      status: item.status,
      matchedClosetItemId: item.matchedClosetItemId,
    };

    if (item.status !== 'missing') {
      return { ...base, recommendations: [] };
    }

    try {
      // dto.gender ya viene validado por @IsIn en el DTO - el cast es seguro.
      const gender = dto.gender as Gender;

      const missingGarment: MissingGarment = {
        category: item.garment.category,
        color: item.garment.color,
        style: item.garment.style,
        gender,
      };

      const rawCandidates = await this.productSearchService.searchForMissingGarment(missingGarment);
      const filtered = filterCandidates(rawCandidates, {
        size: dto.size,
        budget: dto.budget,
        gender,
        category: item.garment.category,
      });

      if (filtered.length === 0) {
        return { ...base, recommendations: [] };
      }

      const ranked = rankCandidates(filtered, missingGarment, storesById, {
        size: dto.size,
        budget: dto.budget,
      });

      // Segunda pasada: el matching por texto (categoría/color/precio) no garantiza que el
      // producto se PAREZCA visualmente al outfit de referencia (silueta, corte, material no
      // son extraíbles de forma confiable de las APIs de las tiendas) - se compara con Azure
      // OpenAI Vision el top-N ya rankeado por texto contra la foto original.
      const topForVisualRerank = ranked.slice(0, TOP_N_FOR_VISUAL_RERANK);
      const visualResults = await this.visualRerankService.rerankByVisualSimilarity(
        [{ base64: originalImageBase64, mimeType: originalMimeType }],
        {
          category: item.garment.category,
          color: item.garment.color,
          style: item.garment.style,
          pattern: item.garment.pattern,
        },
        topForVisualRerank.map((candidate) => ({ imageUrl: candidate.imageUrl })),
      );

      type RankedCandidate = (typeof ranked)[number];
      let finalCandidates: Array<{ candidate: RankedCandidate; visual?: VisualRerankResult }>;

      if (visualResults.length === 0) {
        // Fallback seguro: la pasada visual falló o ningún candidato tenía imagen comparable -
        // se usa el orden de ranking de texto tal cual, sin bloquear la recomendación.
        finalCandidates = ranked.slice(0, TOP_N_RECOMMENDATIONS).map((candidate) => ({ candidate }));
      } else {
        const visualByIndex = new Map(visualResults.map((v) => [v.candidateIndex, v]));
        finalCandidates = topForVisualRerank
          .map((candidate, index) => ({ candidate, visual: visualByIndex.get(index) }))
          .filter(
            (entry): entry is { candidate: RankedCandidate; visual: VisualRerankResult } =>
              entry.visual !== undefined && entry.visual.visualMatchScore >= VISUAL_MATCH_THRESHOLD,
          )
          .sort((a, b) => b.visual.visualMatchScore - a.visual.visualMatchScore)
          .slice(0, TOP_N_RECOMMENDATIONS);
      }

      const recommendations: RecommendationOutput[] = [];
      for (const { candidate, visual } of finalCandidates) {
        const picked = pickBestVariant(candidate, { size: dto.size });
        if (!picked) {
          continue;
        }

        const scoreBreakdown: Record<string, number | string> = { ...candidate.scoreBreakdown };
        if (visual) {
          scoreBreakdown.visualMatchScore = visual.visualMatchScore;
          scoreBreakdown.reason = visual.reason;
        }

        const persisted = await this.persistRecommendation(
          userId,
          item.id,
          picked.variantId,
          candidate.score,
          scoreBreakdown,
        );
        if (!persisted) {
          continue;
        }

        recommendations.push({
          productVariantId: picked.variantId,
          score: candidate.score,
          scoreBreakdown,
          productName: candidate.name,
          storeUrl: candidate.url,
          price: picked.price,
          imageUrl: candidate.imageUrl,
        });
      }

      return { ...base, recommendations };
    } catch (error) {
      this.logger.warn(`Failed to build recommendations for outfit_item ${item.id}: ${String(error)}`);
      return { ...base, recommendations: [] };
    }
  }

  private async persistRecommendation(
    userId: string,
    outfitItemId: string,
    productVariantId: string,
    score: number,
    scoreBreakdown: Record<string, number | string>,
  ): Promise<boolean> {
    const { error } = await this.supabase.from('recommendations').insert({
      user_id: userId,
      outfit_item_id: outfitItemId,
      product_variant_id: productVariantId,
      score,
      score_breakdown: scoreBreakdown,
    });

    if (error) {
      this.logger.warn(`Failed to persist recommendation for outfit_item ${outfitItemId}: ${error.message}`);
      return false;
    }

    return true;
  }
}
