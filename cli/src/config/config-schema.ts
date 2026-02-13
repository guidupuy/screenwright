import { z } from 'zod';

export const configSchema = z.object({
  voice: z.string().default('en_US-amy-medium'),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).default({ width: 1280, height: 720 }),
  outputDir: z.string().default('./output'),
  locale: z.string().default('en-US'),
  colorScheme: z.enum(['light', 'dark']).default('light'),
  timezoneId: z.string().default('America/New_York'),
});

export type ScreenwrightConfig = z.infer<typeof configSchema>;
