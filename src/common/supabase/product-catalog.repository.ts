import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_CLIENT } from './supabase-service-client.provider';
import type {
  NormalizedProduct,
  NormalizedVariant,
  ProductCatalogRepository,
  StoreRecord,
} from './product-catalog.repository.interface';

@Injectable()
export class SupabaseProductCatalogRepository implements ProductCatalogRepository {
  constructor(@Inject(SUPABASE_SERVICE_CLIENT) private readonly supabase: SupabaseClient) {}

  async getActiveStores(): Promise<StoreRecord[]> {
    const { data, error } = await this.supabase
      .from('stores')
      .select('id, integration_type, config')
      .eq('active', true);

    if (error) {
      throw new Error(`Failed to fetch active stores: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      integrationType: row.integration_type as string,
      config: (row.config ?? {}) as Record<string, unknown>,
    }));
  }

  async upsertProduct(storeId: string, product: NormalizedProduct): Promise<string> {
    const now = new Date().toISOString();

    // last_checked_at/last_seen_at solo tienen default a nivel de columna para INSERT -
    // en un UPDATE por conflicto hay que mandarlos explícitamente o quedan con el valor viejo.
    const { data, error } = await this.supabase
      .from('products')
      .upsert(
        {
          store_id: storeId,
          external_id: product.externalId,
          name: product.name,
          category: product.category,
          color: product.color,
          pattern: product.pattern,
          material: product.material,
          style: product.style,
          url: product.url,
          image_url: product.imageUrl,
          availability: product.availability,
          last_checked_at: now,
          last_seen_at: now,
        },
        { onConflict: 'store_id,external_id' },
      )
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(
        `Failed to upsert product ${product.externalId} for store ${storeId}: ${error?.message}`,
      );
    }

    return data.id as string;
  }

  async upsertVariant(productId: string, variant: NormalizedVariant): Promise<string> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('product_variants')
      .upsert(
        {
          product_id: productId,
          size: variant.size,
          price: variant.price,
          currency: variant.currency,
          stock_status: variant.stockStatus,
          availability: variant.availability,
          last_checked_at: now,
          last_seen_at: now,
        },
        { onConflict: 'product_id,size' },
      )
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert variant for product ${productId}: ${error?.message}`);
    }

    return data.id as string;
  }
}
