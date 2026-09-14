import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  OutfitAnalysisSchema,
  toAzureJsonSchema,
  type OutfitAnalysis,
} from './schemas/outfit-analysis.schema';

const ANALYSIS_PROMPT =
  'Analiza esta imagen de un outfit. Identifica cada prenda visible y describe, para cada una, ' +
  'su categoría (ej. camisa, pantalón, zapatos), color predominante, material, patrón (ej. liso, ' +
  'a rayas, estampado) y estilo (ej. casual, formal, deportivo).';

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
    const url = `${this.endpoint}/openai/v1/responses`;

    const body = {
      model: this.deploymentName,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: ANALYSIS_PROMPT },
            { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'OutfitAnalysis',
          schema: toAzureJsonSchema(),
          strict: true,
        },
      },
      max_output_tokens: 800,
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
      this.logger.error('Azure OpenAI request failed to send', error);
      throw new InternalServerErrorException('Outfit analysis service is unavailable');
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`Azure OpenAI responded with status ${response.status}: ${errorBody}`);
      throw new InternalServerErrorException('Outfit analysis service failed to process the image');
    }

    const data = (await response.json()) as AzureResponsesApiResponse;

    const messageItem = data.output?.find((item) => item.type === 'message');
    const textContent = messageItem?.content?.find((c) => typeof c.text === 'string');
    const rawText = textContent?.text;

    if (!rawText) {
      this.logger.error(`Azure OpenAI response missing message text: ${JSON.stringify(data)}`);
      throw new InternalServerErrorException('Outfit analysis service returned an unexpected response');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (error) {
      this.logger.error(`Failed to parse Azure OpenAI output as JSON: ${rawText}`, error);
      throw new InternalServerErrorException('Outfit analysis service returned malformed data');
    }

    const result = OutfitAnalysisSchema.safeParse(parsedJson);
    if (!result.success) {
      this.logger.error(
        `Azure OpenAI output failed schema validation: ${JSON.stringify(result.error.format())}`,
      );
      throw new InternalServerErrorException('Outfit analysis service returned data in an unexpected shape');
    }

    return result.data;
  }
}
