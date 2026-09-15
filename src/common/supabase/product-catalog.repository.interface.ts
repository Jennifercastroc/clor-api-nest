export interface StoreRecord {
  id: string;
  integrationType: string;
  config: Record<string, unknown>;
}

export interface NormalizedProduct {
  externalId: string;
  name: string | null;
  category: string | null;
  color: string | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  url: string | null;
  imageUrl: string | null;
  availability: boolean;
}

export interface NormalizedVariant {
  size: string | null;
  price: number | null;
  currency: string;
  stockStatus: string | null;
  availability: boolean;
}

export const PRODUCT_CATALOG_REPOSITORY = 'PRODUCT_CATALOG_REPOSITORY';

export interface ProductCatalogRepository {
  getActiveStores(): Promise<StoreRecord[]>;
  upsertProduct(storeId: string, product: NormalizedProduct): Promise<string>;
  upsertVariant(productId: string, variant: NormalizedVariant): Promise<string>;
}
