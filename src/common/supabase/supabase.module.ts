import { Module } from '@nestjs/common';
import { SUPABASE_CLIENT, supabaseClientProvider } from './supabase-client.provider';
import { SUPABASE_SERVICE_CLIENT, supabaseServiceClientProvider } from './supabase-service-client.provider';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { PRODUCT_CATALOG_REPOSITORY } from './product-catalog.repository.interface';
import { SupabaseProductCatalogRepository } from './product-catalog.repository';

@Module({
  providers: [
    supabaseClientProvider,
    supabaseServiceClientProvider,
    SupabaseAuthGuard,
    { provide: PRODUCT_CATALOG_REPOSITORY, useClass: SupabaseProductCatalogRepository },
  ],
  exports: [SUPABASE_CLIENT, SUPABASE_SERVICE_CLIENT, SupabaseAuthGuard, PRODUCT_CATALOG_REPOSITORY],
})
export class SupabaseModule {}
