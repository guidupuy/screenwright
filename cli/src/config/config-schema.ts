import { z } from 'zod';

export const openaiVoices = [
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'nova', 'onyx', 'sage', 'shimmer',
] as const;

export type OpenaiVoice = (typeof openaiVoices)[number];

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
  ttsProvider: z.enum(['piper', 'openai']).default('piper'),
  openaiVoice: z.enum(openaiVoices).default('nova'),
});

export type ScreenwrightConfig = z.infer<typeof configSchema>;
