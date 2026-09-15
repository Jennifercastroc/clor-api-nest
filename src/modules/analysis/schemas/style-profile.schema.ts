import { z } from 'zod';

export const StyleProfileSchema = z.object({
  styleNarrative: z.string(),
  accessoryRecommendation: z.string(),
  essentialDescriptions: z.array(
    z.object({
      categoryKey: z.string(),
      specificDescription: z.string(),
    }),
  ),
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export function toAzureJsonSchema() {
  return z.toJSONSchema(StyleProfileSchema);
}
