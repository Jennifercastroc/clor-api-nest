import type { Gender } from '../gender';

// Mapea substrings en español (nombre + tags/collections del producto) a una categoría
// canónica. Se recorre en orden, así que las palabras más específicas van antes que las
// que podrían quedar contenidas en otra (ej. "camiseta" antes que "camisa").
const CATEGORY_KEYWORDS: Array<[string, string]> = [
  // Categoría propia en vez de mapearlo a "camiseta" - un body es una silueta distinta y
  // confundirlo con una camiseta genérica sería tan falso como el bug de "vestido" que
  // arreglamos antes.
  ['bodysuit', 'body'],
  ['body', 'body'],
  ['vestido', 'vestido'],
  ['falda', 'falda'],
  ['pantalón', 'pantalón'],
  ['pantalon', 'pantalón'],
  ['jean', 'jean'],
  ['camiseta', 'camiseta'],
  ['camisa', 'camisa'],
  ['blusa', 'blusa'],
  ['chaqueta', 'chaqueta'],
  ['abrigo', 'abrigo'],
  ['suéter', 'suéter'],
  ['sueter', 'suéter'],
  ['buzo', 'buzo'],
  ['short', 'short'],
  ['cinturón', 'cinturón'],
  ['cinturon', 'cinturón'],
  ['bolso', 'bolso'],
  ['sandalia', 'sandalia'],
  ['tenis', 'tenis'],
  ['zapato', 'zapato'],
  ['saco', 'saco'],
];

// Un valor de categoría "críptico" (gid de Shopify, path de VTEX sin resolver, etc.) no
// sirve tal cual — mejor tratarlo como si no hubiera categoría y caer al heurístico.
function isCrypticCategory(value: string): boolean {
  return value.startsWith('gid://') || value.includes('/') || /^[0-9a-f]{16,}$/i.test(value);
}

function matchCategoryKeyword(haystack: string): string | null {
  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (haystack.includes(keyword)) {
      return category;
    }
  }
  return null;
}

export function normalizeCategory(input: {
  category: string | null;
  name: string;
  rawTags?: string[];
  rawCollections?: string[];
}): string | null {
  const cleaned = input.category?.trim();
  if (cleaned && !isCrypticCategory(cleaned)) {
    return cleaned.toLowerCase();
  }

  // Los tags reales del producto son más específicos que las collections (que a veces
  // agrupan varios tipos de prenda bajo un mismo título) - se prueban primero, y solo si
  // no matchean nada se amplía la búsqueda a collections como último recurso.
  const tagsHaystack = [input.name, ...(input.rawTags ?? [])].join(' ').toLowerCase();
  const tagsMatch = matchCategoryKeyword(tagsHaystack);
  if (tagsMatch) {
    return tagsMatch;
  }

  const collectionsHaystack = [input.name, ...(input.rawCollections ?? [])].join(' ').toLowerCase();
  return matchCategoryKeyword(collectionsHaystack);
}

interface BasicColor {
  name: string;
  rgb: [number, number, number];
}

// ~18 colores básicos en español con su RGB de referencia, usados solo para encontrar el
// nombre más cercano a un hex — no pretende ser una paleta exhaustiva de moda.
const BASIC_COLORS: BasicColor[] = [
  { name: 'negro', rgb: [0, 0, 0] },
  { name: 'blanco', rgb: [255, 255, 255] },
  { name: 'gris', rgb: [128, 128, 128] },
  { name: 'beige', rgb: [245, 245, 220] },
  { name: 'marfil', rgb: [255, 255, 240] },
  { name: 'café', rgb: [101, 67, 33] },
  { name: 'rojo', rgb: [255, 0, 0] },
  { name: 'vino', rgb: [128, 0, 32] },
  { name: 'naranja', rgb: [255, 140, 0] },
  { name: 'amarillo', rgb: [255, 255, 0] },
  { name: 'verde', rgb: [0, 128, 0] },
  { name: 'verde oliva', rgb: [128, 128, 0] },
  { name: 'turquesa', rgb: [64, 224, 208] },
  { name: 'azul', rgb: [0, 0, 255] },
  { name: 'azul marino', rgb: [0, 0, 128] },
  { name: 'morado', rgb: [128, 0, 128] },
  { name: 'rosado', rgb: [255, 192, 203] },
  { name: 'dorado', rgb: [212, 175, 55] },
  { name: 'plateado', rgb: [192, 192, 192] },
  // Variantes claras/pálidas — sin ellas, cualquier tono pastel terminaba clasificado como
  // blanco/beige/marfil/plateado por pura cercanía en brillo, sin importar el matiz real
  // (ej. un verde-amarillo pálido como #e4eb96 caía en "plateado").
  { name: 'verde claro', rgb: [180, 220, 140] },
  { name: 'amarillo claro', rgb: [255, 250, 180] },
  { name: 'azul claro', rgb: [173, 216, 230] },
  { name: 'rosa claro', rgb: [255, 210, 220] },
  { name: 'lila', rgb: [200, 180, 220] },
];

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

function closestColorName(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  let closest = BASIC_COLORS[0];
  let minDistance = Infinity;

  for (const color of BASIC_COLORS) {
    const [cr, cg, cb] = color.rgb;
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < minDistance) {
      minDistance = distance;
      closest = color;
    }
  }

  return closest.name;
}

export function normalizeColor(input: string | null): string | null {
  if (input === null) {
    return null;
  }

  const trimmed = input.trim();
  const hexMatch = HEX_PATTERN.exec(trimmed);
  if (hexMatch) {
    return closestColorName(hexMatch[1]);
  }

  return trimmed.toLowerCase();
}

// Señales de género vistas en datos reales de tiendas: tags/collections de Shopify (ej.
// "ALL MUJER", "DENIM MUJER") y segmentos del path de categoría de VTEX (ej. "/Niñas/...").
const FEMALE_GENDER_SIGNALS = [
  'mujer',
  'mujeres',
  'dama',
  'damas',
  'niña',
  'niñas',
  'femenino',
  'girl',
  'girls',
  'woman',
  'women',
];
const MALE_GENDER_SIGNALS = [
  'hombre',
  'hombres',
  'caballero',
  'caballeros',
  'niño',
  'niños',
  'masculino',
  'boy',
  'boys',
  'man',
  'men',
];

function detectGenderSignal(haystack: string): 'mujer' | 'hombre' | 'ambos' | null {
  const hasFemale = FEMALE_GENDER_SIGNALS.some((keyword) => haystack.includes(keyword));
  const hasMale = MALE_GENDER_SIGNALS.some((keyword) => haystack.includes(keyword));
  if (hasFemale && hasMale) {
    return 'ambos';
  }
  if (hasFemale) {
    return 'mujer';
  }
  if (hasMale) {
    return 'hombre';
  }
  return null;
}

// Restricción dura de género: solo descarta cuando hay una señal CLARA y ÚNICA del género
// contrario en los datos reales del producto. Si no hay ninguna señal, o si aparecen señales
// de ambos géneros (ej. un producto listado tanto en la colección "mujer" como en "hombre" -
// caso real visto en Undergold), se considera ambiguo/unisex y NO se descarta - no se inventa
// una señal de género que los datos no sostienen claramente.
export function hasConflictingGenderSignal(
  targetGender: Gender,
  candidate: { rawTags?: string[]; rawCollections?: string[]; rawCategoryPath?: string },
): boolean {
  if (targetGender === 'unisex') {
    return false;
  }

  const haystack = [
    ...(candidate.rawTags ?? []),
    ...(candidate.rawCollections ?? []),
    candidate.rawCategoryPath ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const signal = detectGenderSignal(haystack);
  if (signal === null || signal === 'ambos') {
    return false;
  }

  return signal !== targetGender;
}
