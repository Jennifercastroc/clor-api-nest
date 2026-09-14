import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClosetModule } from './modules/closet/closet.module';
import { OutfitsModule } from './modules/outfits/outfits.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { ProductSearchModule } from './modules/product-search/product-search.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    ClosetModule, OutfitsModule, AnalysisModule, ProductSearchModule, RecommendationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
