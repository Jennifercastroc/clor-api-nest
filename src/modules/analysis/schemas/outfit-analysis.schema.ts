import { z } from 'zod';

// Vocabulario cerrado de estilo - antes era texto libre (z.string()), lo que hacía imposible
// un match confiable contra stores.style_tags. 8 valores, "creativo" como catch-all solo si
// ninguno de los otros 7 aplica bien. Cambiar esta lista requiere avisar a Supabase, ya que
// stores.style_tags depende de este mismo vocabulario (ver STYLE_TAG_DEFINITIONS en
// azure-openai.client.ts, que debe mantenerse en sync con este enum).
export const STYLE_VALUES = [
  'streetwear',
  'casual',
  'old_money',
  'preppy',
  'romantico',
  'alternativo',
  'cottagecore',
  'creativo',
] as const;

export const OutfitAnalysisSchema = z.object({
  garments: z.array(
    z.object({
      category: z.string(),
      color: z.string(),
      material: z.string(),
      pattern: z.string(),
      style: z.enum(STYLE_VALUES),
      is_statement_piece: z.boolean(),
    }),
  ),
  accessories_detected: z.array(
    z.object({
      category: z.string(),
      color: z.string(),
      description: z.string(),
    }),
  ),
  styling_notes: z.string(),
});

export type OutfitAnalysis = z.infer<typeof OutfitAnalysisSchema>;

export function toAzureJsonSchema() {
  return z.toJSONSchema(OutfitAnalysisSchema);
}
