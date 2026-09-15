import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { ClosetModule } from '../closet/closet.module';
import { ProductSearchModule } from '../product-search/product-search.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AzureOpenAiClient } from './azure-openai.client';
import { VisualRerankService } from './visual-rerank.service';
import { BoardAnalysisService } from './board-analysis.service';

@Module({
  imports: [SupabaseModule, ClosetModule, ProductSearchModule],
  controllers: [AnalysisController],
  providers: [AzureOpenAiClient, AnalysisService, VisualRerankService, BoardAnalysisService],
})
export class AnalysisModule {}
