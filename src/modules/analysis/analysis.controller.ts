import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnalysisService } from './analysis.service';
import { AnalyzeOutfitDto } from './dto/analyze-outfit.dto';

@Controller('outfits')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  // TODO: proteger con guard de Supabase Auth cuando esté disponible (ver punto de sincronización #4).
  @Post('analyze')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async analyze(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AnalyzeOutfitDto,
  ) {
    if (!file) {
      throw new BadRequestException('image file is required');
    }

    return this.analysisService.analyzeOutfit(file, dto);
  }
}
