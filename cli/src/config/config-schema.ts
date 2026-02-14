import { z } from 'zod';

export const openaiVoices = [
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo',
  'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
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
  pacing: z.enum(['fast', 'normal', 'cinematic']).default('normal'),
  captureMode: z.enum(['frames', 'video']).default('frames'),
});

export type ScreenwrightConfig = z.infer<typeof configSchema>;
