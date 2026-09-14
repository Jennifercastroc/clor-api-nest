import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AzureOpenAiClient } from './azure-openai.client';

@Module({
  controllers: [AnalysisController],
  providers: [AzureOpenAiClient, AnalysisService],
})
export class AnalysisModule {}
