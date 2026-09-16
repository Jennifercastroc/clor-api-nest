# Outfit Optimizer — Backend

Sistema que recibe una imagen o un tablero de inspiración de outfits,
identifica las prendas con IA, las compara contra lo que el usuario ya
tiene, y recomienda productos reales de tiendas locales para completar
el look — con filtros y ranking explicables, no una caja negra.

Este README es del **backend** (NestJS). El frontend (Next.js) tiene su
propio repo y su propio README.

## Índice

- [Modelo de negocio y problema que resuelve](#modelo-de-negocio-y-problema-que-resuelve)
- [Cómo funciona (flujo end-to-end)](#cómo-funciona-flujo-end-to-end)
- [El papel de la IA](#el-papel-de-la-ia)
- [Stack técnico](#stack-técnico)
- [Tiendas integradas](#tiendas-integradas)
- [Seguridad](#seguridad)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Cómo correrlo](#cómo-correrlo)
- [Limitaciones conocidas y roadmap](#limitaciones-conocidas-y-roadmap)

## Modelo de negocio y problema que resuelve

Casi todo el mundo ha visto un outfit en Pinterest, Instagram, o en la
calle, y ha pensado "quiero ese look" — pero no sabe exactamente qué
prendas lo componen, cuáles ya tiene, ni dónde comprar las que le
faltan, especialmente en tiendas que existan donde vive. La mayoría de
herramientas se quedan en "aquí tienes fotos parecidas". Nosotros
cerramos el círculo entre la inspiración y la compra real.

El valor para el usuario final es reducir fricción: de una imagen a una
lista corta y explicable de productos que puede comprar hoy, en tiendas
reales, dentro de su presupuesto y su talla.

El valor para las tiendas es aparecer frente a compradores que ya
tienen intención de compra específica (no búsqueda genérica), filtrados
por si su estilo de marca realmente encaja con lo que el usuario busca
— así que no compiten contra tiendas de un estilo completamente
distinto por el mismo tráfico.

## Cómo funciona (flujo end-to-end)

```
Imagen / Tablero de inspiración
        ↓
Azure OpenAI Vision (análisis estructurado)
        ↓
Lista de prendas requeridas (categoría, color, patrón, estilo)
        ↓
Comparación con lo que el usuario ya tiene (checklist)
        ↓
Prendas faltantes
        ↓
Búsqueda en tiendas reales (Shopify / VTEX)
        ↓
Filtrado duro (categoría, talla, disponibilidad, género)
        ↓
Ranking por texto (categoría, color, estilo, precio, estilo de tienda)
        ↓
Re-ranking visual con IA (foto real del producto vs. imagen de referencia)
        ↓
Recomendaciones explicables (con el desglose del porqué de cada una)
```

## El papel de la IA

La IA (Azure OpenAI, modelo con visión) tiene un trabajo deliberadamente
acotado: **leer la imagen y convertirla en datos estructurados y
validados** — nunca decide qué recomendar. Esta separación es una
decisión de arquitectura, no una limitación:

- El análisis por imagen produce un JSON validado con **Zod** (schema
  estricto, `strict: true` en la respuesta de Azure), con campos como
  `category`, `color`, `material`, `pattern`, y `style` (un enum
  cerrado de 8 valores: `streetwear`, `casual`, `old_money`, `preppy`,
  `romantico`, `alternativo`, `cottagecore`, `creativo` — cerrado a
  propósito para que sea comparable de forma determinística contra el
  estilo de cada tienda, en vez de depender de texto libre inconsistente).
- Todo lo que pasa después — comparar con el clóset, filtrar
  candidatos, calcular el ranking, decidir qué mostrar — es **código
  determinístico nuestro**, con pesos configurables y auditable línea
  por línea. Si algo sale mal, se puede diagnosticar exactamente en qué
  paso, en vez de adivinar qué "pensó" un modelo.
- Hay un segundo uso, más acotado, de IA en el re-ranking visual: sobre
  el top de candidatos ya filtrados y rankeados por texto, se le pide
  al modelo comparar la foto real del producto contra la imagen de
  referencia y dar un score de similitud visual — de nuevo, un input
  más al ranking determinístico, no una decisión final por sí sola.

## Stack técnico

| Tecnología | Para qué se usa |
|---|---|
| **NestJS + TypeScript** | Backend: controllers, casos de uso, lógica de negocio separada de infraestructura |
| **Azure OpenAI (Responses API)** | Análisis visual del outfit, extracción estructurada |
| **Zod** | Validación de los datos que devuelve la IA antes de confiar en ellos |
| **Supabase (PostgreSQL + Auth)** | Base de datos, autenticación de usuarios (JWT), y RLS |
| **Bun** | Runtime y gestor de paquetes (más rápido que npm para este proyecto) |
| **@nestjs/throttler** | Rate limiting básico para proteger los endpoints |
| **Shopify (protocolo de comercio) / VTEX (API pública)** | Integraciones reales de catálogo con tiendas |

## Tiendas integradas

Las tiendas no están hardcodeadas: viven en la tabla `stores` de
Supabase, con un `integration_type` (`shopify_mcp` | `vtex_api` |
`manual`) que decide qué adaptador usar, detrás de una interfaz común
`ProductProvider`. Cada tienda tiene además `style_tags` y
`is_versatile` — esto es lo que permite que una búsqueda de estilo
streetwear priorice tiendas como Undergold, y una de estilo old money
priorice tiendas como Studio F, en vez de mezclar resultados sin
criterio.

No se hace scraping genérico: cada integración se verificó en vivo
contra la API real de la tienda antes de agregarla. Si una tienda no
tiene una fuente de datos viable, se usa carga manual curada en vez de
inventar disponibilidad.

## Seguridad

- Autenticación vía Supabase Auth (JWT), validado en un guard
  compartido — no existe un módulo de negocio `users` propio.
- Nunca se exponen `AZURE_OPENAI_API_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`
  al frontend — viven solo en el `.env` del backend.
- Rate limiting global (`@nestjs/throttler`) para mitigar abuso básico.
- Validación de DTOs en cada endpoint.
- Los errores nunca filtran detalles internos de Azure/Supabase al
  cliente.

## Estructura del proyecto

```
src/
├── modules/
│   ├── closet/            # clóset del usuario (checklist, sin fotos)
│   ├── outfits/            # endpoints de análisis (modo 1 y modo 2)
│   ├── analysis/           # cliente de Azure OpenAI, schemas Zod
│   ├── product-search/     # providers (Shopify/VTEX), filtering
│   └── recommendations/    # ranking determinístico configurable
├── common/
│   ├── guards/             # auth guard compartido (Supabase JWT)
│   ├── filters/            # exception filters (sin fugas de secretos)
│   └── supabase/           # cliente + interfaz de repositorio
├── config/
│   └── configuration.ts    # validación de env vars al boot
└── main.ts
```

## Cómo correrlo

Requisitos: **Bun** instalado, **Node ≥20.9.0** disponible (algunas
dependencias del build lo requieren), y un archivo `.env` con las
variables reales (nunca commiteado — usa `.env.example` como plantilla).

```bash
# Instalar dependencias
bun install

# Modo desarrollo (con watch)
bun run start:dev

# Build de producción
bun run build

# Correr el build de producción directamente
bun dist/main.js

# Tests
bun run test

# Lint
bun run lint

# Chequeo de tipos sin compilar
bunx tsc --noEmit
```

Variables de entorno necesarias (nombres, sin valores — cópialos de
`.env.example`): configuración de Azure OpenAI (endpoint, api key,
deployment), configuración de Supabase (url, anon key, service role
key), y el puerto del servidor.

## Limitaciones conocidas y roadmap

- La integración real con Pinterest (OAuth + tableros del usuario)
  quedó pendiente de aprobación de Trial access de la API de Pinterest
  — hoy el flujo funciona subiendo imágenes/capturas directamente, lo
  cual además resultó ser más flexible (no depende de tener cuenta de
  Pinterest ni de tener las imágenes descargadas).
- Fallback a caché cuando una tienda falla en vivo: diseñado, no
  implementado todavía (no bloqueante para el MVP).
- Cobertura de tiendas por estilo sigue creciendo — hay estilos del
  vocabulario (ej. cottagecore, alternativo) con menos tiendas
  dedicadas que streetwear u old money por ahora.
- Personalización basada en historial del usuario a través del tiempo:
  planeada para después de la competencia.