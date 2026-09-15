export interface ProductSearchResult {
  externalId: string;
  name: string;
  category: string | null;
  color: string | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  url: string;
  imageUrl: string | null;
  availability: boolean;
  rawTags?: string[];
  rawCollections?: string[];
  // Path de categoría crudo tal como lo da la tienda (ej. VTEX: "/Niñas/Vestidos/") - puede
  // traer un segmento de género que la categoría ya normalizada/extraída pierde.
  rawCategoryPath?: string;
  variants: Array<{
    size: string | null;
    price: number | null;
    currency: string;
    stockStatus: string | null;
    availability: boolean;
  }>;
}

export interface ProductProvider {
  searchProducts(query: string, limit?: number): Promise<ProductSearchResult[]>;
}
