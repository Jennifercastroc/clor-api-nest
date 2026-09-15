import { Logger } from '@nestjs/common';
import type { ProductProvider, ProductSearchResult } from '../interfaces/product-provider.interface';

const REQUEST_TIMEOUT_MS = 5000;

// TODO: publicar un agent profile propio del Outfit Optimizer (con sus capabilities reales)
// en vez de depender del profile de ejemplo público de Shopify. El endpoint /api/ucp/mcp
// hace una resolución en vivo de esta URL (responde "invalid_profile_url" si no es
// alcanzable), así que no puede ser un placeholder inexistente como se asumió inicialmente
// — tiene que ser una URL real que sirva un JSON de perfil UCP válido.
const AGENT_PROFILE_URL =
  'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json';

interface ShopifyMcpMoney {
  amount: number;
  currency: string;
}

interface ShopifyMcpVariantOption {
  name: string;
  label: string;
}

interface ShopifyMcpProductOption {
  name: string;
  values: Array<{ label: string }>;
}

interface ShopifyMcpMedia {
  type: string;
  url: string;
}

interface ShopifyMcpVariant {
  id: string;
  title: string;
  price?: ShopifyMcpMoney;
  availability?: { available: boolean };
  options?: ShopifyMcpVariantOption[];
}

interface ShopifyMcpCollection {
  title: string;
}

interface ShopifyMcpProduct {
  id: string;
  title: string;
  url: string;
  price_range?: { min?: ShopifyMcpMoney };
  variants?: ShopifyMcpVariant[];
  options?: ShopifyMcpProductOption[];
  media?: ShopifyMcpMedia[];
  tags?: string[];
  collections?: ShopifyMcpCollection[];
}

interface ShopifyMcpSearchResponse {
  jsonrpc: string;
  id: number;
  result?: {
    isError: boolean;
    structuredContent?: {
      products: ShopifyMcpProduct[];
    };
  };
  error?: { code: number; message: string };
}

export class ShopifyMcpProvider implements ProductProvider {
  private readonly logger = new Logger(ShopifyMcpProvider.name);

  constructor(private readonly domain: string) {}

  async searchProducts(query: string, limit = 10): Promise<ProductSearchResult[]> {
    const url = `https://${this.domain}/api/ucp/mcp`;
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_catalog',
        arguments: {
          meta: {
            'ucp-agent': {
              profile: AGENT_PROFILE_URL,
            },
          },
          catalog: {
            query,
          },
        },
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`${this.domain}: MCP request failed with status ${response.status}`);
        return [];
      }

      const data = (await response.json()) as ShopifyMcpSearchResponse;

      if (data.error) {
        this.logger.warn(`${this.domain}: MCP error - ${data.error.message}`);
        return [];
      }

      const products = data.result?.structuredContent?.products ?? [];
      // El endpoint no respeta ningún parámetro de límite enviado en el request (probado
      // con "first"), siempre devuelve su page size por defecto — el límite se aplica acá.
      return products.slice(0, limit).map((product) => this.mapProduct(product));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`${this.domain}: MCP request failed - ${message}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapProduct(product: ShopifyMcpProduct): ProductSearchResult {
    const variants = product.variants ?? [];
    const colorOption = product.options?.find((option) => option.name.toLowerCase() === 'color');

    return {
      externalId: product.id,
      name: product.title,
      // Shopify no expone categoría, patrón, material ni estilo como campos estructurados
      // en este endpoint — solo un taxonomy gid sin resolver y texto libre en tags/description.
      category: null,
      color: colorOption?.values[0]?.label ?? null,
      pattern: null,
      material: null,
      style: null,
      url: product.url,
      imageUrl: product.media?.[0]?.url ?? null,
      availability: variants.some((variant) => variant.availability?.available === true),
      variants: variants.map((variant) => this.mapVariant(variant, product)),
      // Separados a propósito: los tags son específicos del producto, mientras que las
      // collections a veces agrupan varios tipos de prenda bajo un mismo título (ej. "BODIES
      // Y VESTIDOS BASICOS MUJER") y pueden inducir a error si se buscan con la misma prioridad.
      rawTags: product.tags ?? [],
      rawCollections: product.collections?.map((c) => c.title) ?? [],
    };
  }

  private mapVariant(
    variant: ShopifyMcpVariant,
    product: ShopifyMcpProduct,
  ): ProductSearchResult['variants'][number] {
    const sizeOption = variant.options?.find((option) => option.name.toLowerCase() === 'size');
    const isAvailable = variant.availability?.available ?? false;

    return {
      size: sizeOption?.label ?? variant.title ?? null,
      // El monto viene en centavos (amount / 100 = precio real observado en pesos colombianos).
      price: variant.price ? variant.price.amount / 100 : null,
      currency: variant.price?.currency ?? product.price_range?.min?.currency ?? 'COP',
      stockStatus: isAvailable ? 'in_stock' : 'out_of_stock',
      availability: isAvailable,
    };
  }
}
