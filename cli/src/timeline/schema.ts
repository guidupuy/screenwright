import { z } from 'zod';
import { transitionTypes } from './types.js';

const sceneSlideConfigSchema = z.object({
  duration: z.number().positive().optional(),
  brandColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional(),
  textColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional(),
  fontFamily: z.string().optional(),
  titleFontSize: z.number().positive().optional(),
});

const sceneEventSchema = z.object({
  type: z.literal('scene'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  title: z.string(),
  description: z.string().optional(),
  slide: sceneSlideConfigSchema.optional(),
});

const actionEventSchema = z.object({
  type: z.literal('action'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  action: z.enum(['click', 'dblclick', 'fill', 'hover', 'press', 'navigate']),
  selector: z.string(),
  value: z.string().optional(),
  durationMs: z.number().nonnegative(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).nullable(),
  settledAtMs: z.number().nonnegative().optional(),
});

const cursorTargetEventSchema = z.object({
  type: z.literal('cursor_target'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  moveDurationMs: z.number().positive(),
  easing: z.literal('bezier'),
});

const narrationEventSchema = z.object({
  type: z.literal('narration'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  text: z.string().min(1),
  audioDurationMs: z.number().positive().optional(),
  audioFile: z.string().optional(),
});

const waitEventSchema = z.object({
  type: z.literal('wait'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
  reason: z.enum(['pacing', 'narration_sync', 'page_load']),
});

const timelineEventSchema = z.discriminatedUnion('type', [
  sceneEventSchema,
  actionEventSchema,
  cursorTargetEventSchema,
  narrationEventSchema,
  waitEventSchema,
]);

const manifestEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame'), file: z.string() }),
  z.object({ type: z.literal('hold'), file: z.string(), count: z.number().int().positive() }),
]);

const transitionMarkerSchema = z.object({
  afterEntryIndex: z.number().int().nonnegative(),
  transition: z.enum(transitionTypes),
  durationFrames: z.number().int().positive(),
  beforeFile: z.string().optional(),
  afterFile: z.string().optional(),
  consumedFrames: z.number().int().positive().optional(),
});

export const timelineSchema = z.object({
  version: z.literal(2),
  metadata: z.object({
    testFile: z.string(),
    scenarioFile: z.string(),
    recordedAt: z.string().datetime(),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    frameManifest: z.array(manifestEntrySchema).min(1),
    transitionMarkers: z.array(transitionMarkerSchema),
  }),
  events: z.array(timelineEventSchema),
}).refine(
  t => t.events.every(e => {
    if (e.type !== 'action') return true;
    return e.settledAtMs === undefined || e.settledAtMs >= e.timestampMs;
  }),
  { message: 'settledAtMs must be >= timestampMs' },
);

export type ValidatedTimeline = z.infer<typeof timelineSchema>;
