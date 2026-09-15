import { z } from 'zod';

export const VisualRerankSchema = z.object({
  results: z.array(
    z.object({
      candidateIndex: z.number(),
      visual_match_score: z.number(),
      reason: z.string(),
    }),
  ),
});

export type VisualRerank = z.infer<typeof VisualRerankSchema>;

export function toAzureJsonSchema() {
  return z.toJSONSchema(VisualRerankSchema);
}
