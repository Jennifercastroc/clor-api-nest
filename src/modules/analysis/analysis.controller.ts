import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../common/guards/supabase-auth.guard';
import { AnalysisService } from './analysis.service';
import { BoardAnalysisService } from './board-analysis.service';
import { AnalyzeOutfitDto } from './dto/analyze-outfit.dto';
import { AnalyzeBoardDto } from './dto/analyze-board.dto';
import { ALLOWED_MIME_TYPES } from './allowed-mime-types';
import { MAX_BOARD_IMAGES } from './board-constants';
import type { Gender } from '../product-search/gender';

@Controller('outfits')
@UseGuards(SupabaseAuthGuard)
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly boardAnalysisService: BoardAnalysisService,
  ) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async analyze(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AnalyzeOutfitDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('image file is required');
    }

    return this.analysisService.analyzeOutfit(file, dto, request.user.id);
  }

  @Post('analyze-board')
  @UseInterceptors(
    FilesInterceptor('images', MAX_BOARD_IMAGES, { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async analyzeBoard(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: AnalyzeBoardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('at least one image is required');
    }

    const invalidFile = files.find((file) => !ALLOWED_MIME_TYPES.includes(file.mimetype));
    if (invalidFile) {
      throw new BadRequestException('Only image/jpeg and image/png files are supported');
    }

    return this.boardAnalysisService.analyzeBoard(
      files.map((file) => file.buffer),
      files.map((file) => file.mimetype),
      request.user.id,
      // dto.gender ya viene validado por @IsIn en el DTO - el cast es seguro.
      { size: dto.size, budget: dto.budget, gender: dto.gender as Gender },
    );
  }
}
