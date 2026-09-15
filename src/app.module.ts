import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClosetModule } from './modules/closet/closet.module';
import { OutfitsModule } from './modules/outfits/outfits.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { ProductSearchModule } from './modules/product-search/product-search.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    // Rate limiting básico, global: 20 requests / 60s por IP. Los endpoints de análisis
    // (Azure OpenAI + búsqueda en 14 tiendas) son los que más justifican esto, pero se aplica
    // a nivel de app entera - no hay necesidad de límites distintos por ruta todavía.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    SupabaseModule,
    ClosetModule, OutfitsModule, AnalysisModule, ProductSearchModule, RecommendationsModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
