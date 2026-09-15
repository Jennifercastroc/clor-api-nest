import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ZodType } from 'zod';
import type { AppConfig } from '../../config/configuration';
import {
  OutfitAnalysisSchema,
  toAzureJsonSchema as toOutfitAnalysisJsonSchema,
  type OutfitAnalysis,
} from './schemas/outfit-analysis.schema';
import {
  VisualRerankSchema,
  toAzureJsonSchema as toVisualRerankJsonSchema,
  type VisualRerank,
} from './schemas/visual-rerank.schema';
import {
  StyleProfileSchema,
  toAzureJsonSchema as toStyleProfileJsonSchema,
  type StyleProfile,
} from './schemas/style-profile.schema';

const ANALYSIS_PROMPT =
  'Analiza esta imagen de un outfit. Identifica cada prenda visible y describe, para cada una, ' +
  'su categoría (ej. camisa, pantalón, zapatos), color predominante, material, patrón (ej. liso, ' +
  'a rayas, estampado) y estilo (ej. casual, formal, deportivo). ' +
  'Además de identificar las prendas base, identifica: ' +
  '1. is_statement_piece en cada prenda: true si la prenda es muy difícil de sustituir por una ' +
  'genérica de tienda (ej. print único, bordado elaborado, corte muy particular, color/textura ' +
  'poco común) - false si es una prenda básica fácilmente reemplazable (ej. camiseta blanca lisa, ' +
  'jean azul básico). ' +
  '2. accessories_detected: identifica joyería, bolsos, cinturones, gafas, sombreros, zapatos ' +
  "statement u otros accesorios visibles que contribuyan al estilo del outfit, aunque no sean " +
  "'prendas' en sentido estricto. Si no hay accesorios visibles, devuelve un array vacío. " +
  '3. styling_notes: un texto breve (1-3 frases) explicando si el look depende fuertemente de ' +
  'accesorios o piezas statement para lograr su efecto completo, y qué debería tener en cuenta ' +
  "el usuario al buscar reemplazos (ej. 'Este look depende del collar dorado grueso y el cinturón " +
  "metálico para el efecto de fiesta; sin ellos el resto de las prendas se ven básicas'). Si el " +
  'outfit es simple/básico sin dependencias fuertes de accesorios, dilo también (ej. \'Outfit ' +
  "básico, no depende de accesorios particulares').";

const STYLE_PROFILE_PROMPT =
  'Eres un analista de estilo de moda. Te voy a dar datos agregados (no imágenes) sobre un ' +
  'conjunto de outfits de un usuario: cuántas imágenes se analizaron, las categorías de prendas ' +
  'esenciales detectadas (con su color, material, patrón y estilo predominante, y qué tan ' +
  'frecuentes son), y candidatos de accesorios recurrentes. Con esto: ' +
  '1. Escribe un styleNarrative de 3 a 5 frases sobre el estilo general, la paleta de colores, ' +
  'los materiales predominantes, para qué clima es apto el guardarropa, y qué lo hace distintivo. ' +
  'Basate estrictamente en los datos que te doy - si no hay una etiqueta de estilo clara, di algo ' +
  'como "una mezcla de X y Y" en vez de inventar una categoría única que los datos no sostienen. ' +
  '2. Escribe un accessoryRecommendation: si te doy candidatos de accesorios con frecuencia alta, ' +
  'da una explicación completa y bien argumentada de por qué vale la pena invertir en ese tipo de ' +
  'accesorio (no una frase de una línea). Si no te doy ningún candidato de accesorio, deja este ' +
  'campo como string vacío "". ' +
  '3. Para cada categoría esencial que te doy (identificada por su categoryKey), escribe una ' +
  'specificDescription que combine de forma natural su material, patrón, color y estilo - NO ' +
  'repitas solo el nombre genérico de la categoría (ej. en vez de "vestidos", algo como "vestidos ' +
  'largos de satén en tonos oscuros con corte liso, ideales para eventos de noche"). El ' +
  'categoryKey de cada elemento de tu respuesta debe coincidir EXACTO (mismo texto) con el ' +
  'categoryKey que te doy para esa categoría, para poder mapear la respuesta de vuelta sin ' +
  'ambigüedad. NO des generalidades obvias tipo "necesitas camisetas" - basate en las ' +
  'combinaciones reales de material/patrón/color/estilo que te doy, no en la categoría sola.';

export interface StyleProfileInput {
  totalImages: number;
  essentialCategories: Array<{
    categoryKey: string;
    category: string;
    color: string;
    material: string;
    pattern: string;
    style: string;
    imageFrequency: number;
  }>;
  accessoryCandidates: Array<{ category: string; imageFrequency: number }>;
}

interface AzureResponsesApiContentItem {
  type?: string;
  text?: string;
}

interface AzureResponsesApiOutputItem {
  type: string;
  content?: AzureResponsesApiContentItem[];
}

interface AzureResponsesApiResponse {
  output?: AzureResponsesApiOutputItem[];
}

export type AzureInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string };

@Injectable()
export class AzureOpenAiClient {
  private readonly logger = new Logger(AzureOpenAiClient.name);
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deploymentName: string;

  constructor(private readonly configService: ConfigService) {
    const azureConfig = this.configService.get<AppConfig['azureOpenAI']>('azureOpenAI');
    if (!azureConfig) {
      throw new Error('Azure OpenAI configuration is missing');
    }
    this.endpoint = azureConfig.endpoint;
    this.apiKey = azureConfig.apiKey;
    this.deploymentName = azureConfig.deploymentName;
  }

  async analyzeOutfitImage(imageBase64: string, mimeType: string): Promise<OutfitAnalysis> {
    const content: AzureInputContent[] = [
      { type: 'input_text', text: ANALYSIS_PROMPT },
      { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
    ];

    return this.callResponsesApi({
      content,
      jsonSchema: toOutfitAnalysisJsonSchema(),
      schemaName: 'OutfitAnalysis',
      zodSchema: OutfitAnalysisSchema,
      maxOutputTokens: 800,
      errorContext: 'outfit analysis',
    });
  }

  async compareVisualSimilarity(content: AzureInputContent[]): Promise<VisualRerank> {
    return this.callResponsesApi({
      content,
      jsonSchema: toVisualRerankJsonSchema(),
      schemaName: 'VisualRerank',
      zodSchema: VisualRerankSchema,
      maxOutputTokens: 800,
      errorContext: 'visual similarity comparison',
    });
  }

  async synthesizeStyleProfile(input: StyleProfileInput): Promise<StyleProfile> {
    const content: AzureInputContent[] = [
      { type: 'input_text', text: `${STYLE_PROFILE_PROMPT}\n\nDatos:\n${JSON.stringify(input)}` },
    ];

    return this.callResponsesApi({
      content,
      jsonSchema: toStyleProfileJsonSchema(),
      schemaName: 'StyleProfile',
      zodSchema: StyleProfileSchema,
      maxOutputTokens: 1000,
      errorContext: 'style profile synthesis',
    });
  }

  private async callResponsesApi<T>(params: {
    content: AzureInputContent[];
    jsonSchema: Record<string, unknown>;
    schemaName: string;
    zodSchema: ZodType<T>;
    maxOutputTokens: number;
    errorContext: string;
  }): Promise<T> {
    const { content, jsonSchema, schemaName, zodSchema, maxOutputTokens, errorContext } = params;
    const url = `${this.endpoint}/openai/v1/responses`;

    const body = {
      model: this.deploymentName,
      input: [
        {
          role: 'user',
          content,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema: jsonSchema,
          strict: true,
        },
      },
      max_output_tokens: maxOutputTokens,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(`Azure OpenAI request failed to send (${errorContext})`, error);
      throw new InternalServerErrorException(`Azure OpenAI service is unavailable (${errorContext})`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`Azure OpenAI responded with status ${response.status} (${errorContext}): ${errorBody}`);
      throw new InternalServerErrorException(`Azure OpenAI service failed to process the request (${errorContext})`);
    }

    const data = (await response.json()) as AzureResponsesApiResponse;

    const messageItem = data.output?.find((item) => item.type === 'message');
    const textContent = messageItem?.content?.find((c) => typeof c.text === 'string');
    const rawText = textContent?.text;

    if (!rawText) {
      this.logger.error(`Azure OpenAI response missing message text (${errorContext}): ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(`Azure OpenAI service returned an unexpected response (${errorContext})`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (error) {
      this.logger.error(`Failed to parse Azure OpenAI output as JSON (${errorContext}): ${rawText}`, error);
      throw new InternalServerErrorException(`Azure OpenAI service returned malformed data (${errorContext})`);
    }

    const result = zodSchema.safeParse(parsedJson);
    if (!result.success) {
      this.logger.error(
        `Azure OpenAI output failed schema validation (${errorContext}): ${JSON.stringify(result.error.format())}`,
      );
      throw new InternalServerErrorException(
        `Azure OpenAI service returned data in an unexpected shape (${errorContext})`,
      );
    }

    return result.data;
  }
}
