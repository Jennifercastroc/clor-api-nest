import { Injectable, Logger } from '@nestjs/common';
import { AzureOpenAiClient, type AzureInputContent } from './azure-openai.client';

export interface VisualRerankReferenceImage {
  base64: string;
  mimeType: string;
}

export interface VisualRerankGarment {
  category: string;
  color: string;
  style: string;
  pattern: string;
  // Descripción más rica (ej. specificDescription del tablero, combina material+patrón+color+
  // estilo de forma natural) - si viene, se usa en el prompt en vez de la oración armada solo
  // con category/color/style/pattern. Estos campos estructurados igual se mandan siempre como
  // contexto y quedan de fallback si no hay description.
  description?: string;
}

export interface VisualRerankCandidate {
  imageUrl: string | null;
}

export interface VisualRerankResult {
  candidateIndex: number;
  visualMatchScore: number;
  reason: string;
}

function describeGarment(garment: VisualRerankGarment): string {
  if (garment.description) {
    return `${garment.description} (categoría: "${garment.category}")`;
  }
  return (
    `categoría "${garment.category}", color "${garment.color}", estilo "${garment.style}", ` +
    `patrón "${garment.pattern}"`
  );
}

function buildPrompt(garment: VisualRerankGarment, referenceCount: number, candidateCount: number): string {
  const referenceLine =
    referenceCount === 1
      ? 'La primera imagen es el outfit de referencia completo.'
      : `Las primeras ${referenceCount} imágenes son referencias de la misma prenda/categoría buscada ` +
        '(fotos distintas de ejemplos reales).';

  return (
    `${referenceLine} Las siguientes ${candidateCount} imágenes son candidatos de productos, ` +
    `numeradas del 0 al ${candidateCount - 1} en el mismo orden en que aparecen (la imagen ` +
    `número ${referenceCount + 1} de la llamada es el candidato 0, la siguiente es el candidato 1, ` +
    'y así sucesivamente). ' +
    `Estamos buscando un reemplazo para esta prenda: ${describeGarment(garment)}. ` +
    'Para cada candidato, compara qué tan similar es visualmente a esa prenda descrita Y al estilo ' +
    'general de las imágenes de referencia (silueta, corte, textura, nivel de formalidad). Sé ' +
    'especialmente estricto con el PATRÓN/ESTAMPADO: un candidato liso cuando se busca algo ' +
    'estampado (o viceversa), o con un estampado claramente distinto (ej. rayas vs. flores vs. ' +
    'liso vs. animal print), es una diferencia grande que debe bajar el score notablemente aunque ' +
    'la silueta y el color coincidan bien - no es un detalle menor. Da un visual_match_score de 0 ' +
    'a 100 (100 = prácticamente la misma prenda, 0 = no se parece en nada) y una razón breve en ' +
    'español explicando el score, mencionando explícitamente si el patrón coincide o no.'
  );
}

@Injectable()
export class VisualRerankService {
  private readonly logger = new Logger(VisualRerankService.name);

  constructor(private readonly azureOpenAiClient: AzureOpenAiClient) {}

  async rerankByVisualSimilarity(
    referenceImages: VisualRerankReferenceImage[],
    garment: VisualRerankGarment,
    candidates: VisualRerankCandidate[],
  ): Promise<VisualRerankResult[]> {
    // No se puede comparar visualmente un candidato sin imagen - se excluye antes de llamar,
    // pero se conserva su posición original para poder mapear candidateIndex de vuelta.
    const comparable = candidates
      .map((candidate, originalIndex) => ({ ...candidate, originalIndex }))
      .filter((candidate): candidate is VisualRerankCandidate & { originalIndex: number; imageUrl: string } =>
        candidate.imageUrl !== null,
      );

    if (comparable.length === 0 || referenceImages.length === 0) {
      return [];
    }

    const content: AzureInputContent[] = [
      { type: 'input_text', text: buildPrompt(garment, referenceImages.length, comparable.length) },
      ...referenceImages.map((ref) => ({
        type: 'input_image' as const,
        image_url: `data:${ref.mimeType};base64,${ref.base64}`,
      })),
      ...comparable.map((candidate) => ({
        type: 'input_image' as const,
        image_url: candidate.imageUrl,
      })),
    ];

    try {
      const response = await this.azureOpenAiClient.compareVisualSimilarity(content);

      return response.results.map((result) => ({
        candidateIndex: comparable[result.candidateIndex]?.originalIndex ?? result.candidateIndex,
        visualMatchScore: result.visual_match_score,
        reason: result.reason,
      }));
    } catch (error) {
      // Fallback seguro: sin resultados visuales, el caller debe usar el orden de ranking de
      // texto tal cual, sin bloquear el request completo por una falla de esta pasada extra.
      this.logger.warn(`Visual rerank failed, falling back to text-ranking order: ${String(error)}`);
      return [];
    }
  }
}
