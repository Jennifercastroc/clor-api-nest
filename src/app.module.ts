import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { ClosetModule } from './modules/closet/closet.module';
import { OutfitsModule } from './modules/outfits/outfits.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ProductSearchModule } from './modules/product-search/product-search.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SynchronizationModule } from './modules/synchronization/synchronization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    UsersModule, ClosetModule, OutfitsModule, AnalysisModule, CatalogModule, ProductSearchModule, RecommendationsModule, SynchronizationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
