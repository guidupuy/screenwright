import { z } from 'zod';

const sceneEventSchema = z.object({
  type: z.literal('scene'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  title: z.string(),
  description: z.string().optional(),
});

const actionEventSchema = z.object({
  type: z.literal('action'),
  id: z.string(),
  timestampMs: z.number().nonnegative(),
  action: z.enum(['click', 'fill', 'hover', 'select', 'press', 'navigate']),
  selector: z.string(),
  value: z.string().optional(),
  durationMs: z.number().nonnegative(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).nullable(),
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

export const timelineSchema = z.object({
  version: z.literal(1),
  metadata: z.object({
    testFile: z.string(),
    scenarioFile: z.string(),
    recordedAt: z.string().datetime(),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    videoDurationMs: z.number().nonnegative(),
    videoFile: z.string(),
  }),
  events: z.array(timelineEventSchema),
});

export type ValidatedTimeline = z.infer<typeof timelineSchema>;
