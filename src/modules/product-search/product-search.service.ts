import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PRODUCT_CATALOG_REPOSITORY,
  type ProductCatalogRepository,
  type StoreRecord,
} from '../../common/supabase/product-catalog.repository.interface';
import type { ProductProvider, ProductSearchResult } from './interfaces/product-provider.interface';
import { ShopifyMcpProvider } from './providers/shopify-mcp.provider';
import { VtexApiProvider } from './providers/vtex-api.provider';
import { normalizeCategory, normalizeColor } from './normalization/product-normalization.service';
import type { Gender } from './gender';

const RESULTS_PER_STORE = 10;

export interface MissingGarment {
  category: string;
  color: string;
  style: string;
  gender: Gender;
}

export type SearchResultWithStore = Omit<ProductSearchResult, 'variants'> & {
  storeId: string;
  variants: Array<ProductSearchResult['variants'][number] & { variantId: string }>;
};

@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepository,
  ) {}

  async searchForMissingGarment(garment: MissingGarment): Promise<SearchResultWithStore[]> {
    const query = `${garment.category} ${garment.color} ${garment.gender}`.trim();
    const stores = await this.repository.getActiveStores();

    const settled = await Promise.allSettled(
      stores.map((store) => this.searchStore(store, query)),
    );

    const results: SearchResultWithStore[] = [];
    settled.forEach((outcome, index) => {
      const store = stores[index];
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        this.logger.warn(`Store ${store.id} search failed: ${String(outcome.reason)}`);
      }
    });

    return results;
  }

  private async searchStore(store: StoreRecord, query: string): Promise<SearchResultWithStore[]> {
    const provider = this.buildProvider(store);
    if (!provider) {
      return [];
    }

    const rawResults = await provider.searchProducts(query, RESULTS_PER_STORE);
    const normalizedResults: SearchResultWithStore[] = [];

    for (const raw of rawResults) {
      const normalized: ProductSearchResult = {
        ...raw,
        category: normalizeCategory({
          category: raw.category,
          name: raw.name,
          rawTags: raw.rawTags,
          rawCollections: raw.rawCollections,
        }),
        color: normalizeColor(raw.color),
      };

      const productId = await this.repository.upsertProduct(store.id, {
        externalId: normalized.externalId,
        name: normalized.name,
        category: normalized.category,
        color: normalized.color,
        pattern: normalized.pattern,
        material: normalized.material,
        style: normalized.style,
        url: normalized.url,
        imageUrl: normalized.imageUrl,
        availability: normalized.availability,
      });

      const variantsWithId: SearchResultWithStore['variants'] = [];
      for (const variant of normalized.variants) {
        const variantId = await this.repository.upsertVariant(productId, {
          size: variant.size,
          price: variant.price,
          currency: variant.currency,
          stockStatus: variant.stockStatus,
          availability: variant.availability,
        });
        variantsWithId.push({ ...variant, variantId });
      }

      normalizedResults.push({ ...normalized, storeId: store.id, variants: variantsWithId });
    }

    return normalizedResults;
  }

  private buildProvider(store: StoreRecord): ProductProvider | null {
    const baseUrl = store.config?.base_url;
    if (typeof baseUrl !== 'string') {
      this.logger.warn(`Store ${store.id}: config.base_url is missing or invalid, skipping`);
      return null;
    }

    let domain: string;
    try {
      domain = new URL(baseUrl).hostname;
    } catch {
      this.logger.warn(`Store ${store.id}: config.base_url "${baseUrl}" is not a valid URL, skipping`);
      return null;
    }

    switch (store.integrationType) {
      case 'shopify_mcp':
        return new ShopifyMcpProvider(domain);
      case 'vtex_api':
        // TODO: la única tienda vtex_api activa (Mattelsa) tiene config.graphql_endpoint
        // apuntando a VTEX Intelligent Search/GraphQL. Para el MVP usamos la misma búsqueda
        // REST clásica ya probada contra tennis/ela/studiof — confirmado que también
        // responde en mattelsa.net (vía fallback www.). Migrar a GraphQL queda pendiente
        // si Intelligent Search resulta necesario por relevancia de resultados.
        return new VtexApiProvider(domain);
      default:
        this.logger.warn(
          `Store ${store.id}: unsupported integration_type "${store.integrationType}", skipping`,
        );
        return null;
    }
  }
}
