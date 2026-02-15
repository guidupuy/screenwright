import { z } from 'zod';
import { slideAnimations } from '../timeline/types.js';

export const openaiVoices = [
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo',
  'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;

export type OpenaiVoice = (typeof openaiVoices)[number];

export const DEFAULT_TTS_INSTRUCTIONS =
  'Speak in an upbeat, enthusiastic tone. This is a tech product demo video. ' +
  'Be energetic and professional, like a friendly product evangelist.';

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Must be a hex color like #4F46E5');

export const brandingSchema = z.object({
  brandColor: hexColor,
  textColor: hexColor,
  fontFamily: z.string().optional(),
  animation: z.enum(slideAnimations).optional(),
});

export type BrandingConfig = z.infer<typeof brandingSchema>;

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
  openaiTtsInstructions: z.string().default(DEFAULT_TTS_INSTRUCTIONS),
  branding: brandingSchema.optional(),
});

export type ScreenwrightConfig = z.infer<typeof configSchema>;
