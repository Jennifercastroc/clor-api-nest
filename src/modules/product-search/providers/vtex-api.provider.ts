import { Logger } from '@nestjs/common';
import type { ProductProvider, ProductSearchResult } from '../interfaces/product-provider.interface';

const REQUEST_TIMEOUT_MS = 5000;

interface VtexCommertialOffer {
  Price: number;
  ListPrice: number;
  IsAvailable: boolean;
  AvailableQuantity: number;
}

interface VtexSeller {
  commertialOffer: VtexCommertialOffer;
}

interface VtexImage {
  imageUrl: string;
}

interface VtexItem {
  itemId: string;
  Talla?: string[];
  Color?: string[];
  images?: VtexImage[];
  sellers: VtexSeller[];
}

interface VtexProduct {
  productId: string;
  productName: string;
  categories: string[];
  link: string;
  items: VtexItem[];
}

export class VtexApiProvider implements ProductProvider {
  private readonly logger = new Logger(VtexApiProvider.name);

  constructor(private readonly domain: string) {}

  async searchProducts(query: string, limit = 10): Promise<ProductSearchResult[]> {
    const products = await this.fetchProducts(this.domain, query, limit);
    if (products !== null) {
      return products.map((product) => this.mapProduct(product));
    }

    // Algunos dominios raíz (confirmado en ela.com.co y studiof.com.co) no resuelven DNS
    // directamente y solo responden bajo el subdominio "www.". Un solo reintento cubre ese
    // caso real sin necesitar que cada tienda se configure con el prefijo de antemano.
    if (!this.domain.startsWith('www.')) {
      const wwwProducts = await this.fetchProducts(`www.${this.domain}`, query, limit);
      if (wwwProducts !== null) {
        return wwwProducts.map((product) => this.mapProduct(product));
      }
    }

    return [];
  }

  private async fetchProducts(
    domain: string,
    query: string,
    limit: number,
  ): Promise<VtexProduct[] | null> {
    const url =
      `https://${domain}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}` +
      `?_from=0&_to=${Math.max(limit - 1, 0)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      // VTEX responde 206 Partial Content por diseño (paginación vía _from/_to) - es éxito.
      if (!response.ok) {
        this.logger.warn(`${domain}: VTEX search failed with status ${response.status}`);
        return null;
      }

      return (await response.json()) as VtexProduct[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`${domain}: VTEX search request failed - ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapProduct(product: VtexProduct): ProductSearchResult {
    const items = product.items ?? [];
    const firstItem = items[0];

    return {
      externalId: product.productId,
      name: product.productName,
      category: this.extractCategory(product.categories),
      rawCategoryPath: product.categories?.[0],
      color: firstItem?.Color?.[0] ?? null,
      // VTEX no expone patrón/material como campos estándar entre tiendas — cada una define
      // sus propios atributos libres (ej. "Estampado", "Composición") con nombres distintos,
      // no hay una clave común confiable para mapear acá sin lógica por tienda.
      pattern: null,
      material: null,
      style: null,
      url: product.link,
      imageUrl: firstItem?.images?.[0]?.imageUrl ?? null,
      availability: items.some((item) => item.sellers?.[0]?.commertialOffer?.IsAvailable === true),
      variants: items.map((item) => this.mapVariant(item)),
    };
  }

  private mapVariant(item: VtexItem): ProductSearchResult['variants'][number] {
    const offer = item.sellers?.[0]?.commertialOffer;
    const isAvailable = offer?.IsAvailable ?? false;

    return {
      size: item.Talla?.[0] ?? null,
      // VTEX ya da el precio en la unidad real (confirmado contra precios de mercado
      // conocidos) - a diferencia de Shopify, acá no hace falta dividir entre 100.
      price: offer?.Price ?? null,
      currency: 'COP',
      stockStatus: isAvailable ? 'in_stock' : 'out_of_stock',
      availability: isAvailable,
    };
  }

  private extractCategory(categories: string[] | undefined): string | null {
    const mostSpecific = categories?.[0];
    if (!mostSpecific) {
      return null;
    }
    const segments = mostSpecific.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? null;
  }
}
