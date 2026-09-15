import { z } from 'zod';

export const OutfitAnalysisSchema = z.object({
  garments: z.array(
    z.object({
      category: z.string(),
      color: z.string(),
      material: z.string(),
      pattern: z.string(),
      style: z.string(),
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
