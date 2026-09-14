import { BadRequestException, Injectable } from '@nestjs/common';
import { AzureOpenAiClient } from './azure-openai.client';
import { AnalyzeOutfitDto } from './dto/analyze-outfit.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

@Injectable()
export class AnalysisService {
  constructor(private readonly azureOpenAiClient: AzureOpenAiClient) {}

  async analyzeOutfit(file: Express.Multer.File, dto: AnalyzeOutfitDto) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only image/jpeg and image/png files are supported');
    }

    const imageBase64 = file.buffer.toString('base64');
    const analysis = await this.azureOpenAiClient.analyzeOutfitImage(imageBase64, file.mimetype);

    return { analysis, request: dto };
  }
}
