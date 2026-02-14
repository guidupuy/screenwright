import { describe, it, expect } from 'vitest';
import { timelineSchema } from '../../src/timeline/schema.js';
import sampleTimeline from '../fixtures/sample-timeline.json';

describe('timelineSchema', () => {
  it('validates a well-formed timeline', () => {
    const result = timelineSchema.safeParse(sampleTimeline);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const bad = { ...sampleTimeline, version: 2 };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects missing metadata fields', () => {
    const bad = { ...sampleTimeline, metadata: { testFile: 'x' } };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects invalid event type', () => {
    const bad = {
      ...sampleTimeline,
      events: [{ type: 'bogus', id: 'x', timestampMs: 0 }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects negative timestamps', () => {
    const bad = {
      ...sampleTimeline,
      events: [{
        type: 'scene',
        id: 'ev-001',
        timestampMs: -1,
        title: 'Bad',
      }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects action event with invalid action type', () => {
    const bad = {
      ...sampleTimeline,
      events: [{
        type: 'action',
        id: 'ev-001',
        timestampMs: 0,
        action: 'destroy',
        selector: '.x',
        durationMs: 100,
        boundingBox: null,
      }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts action event with null boundingBox', () => {
    const timeline = {
      ...sampleTimeline,
      events: [{
        type: 'action',
        id: 'ev-001',
        timestampMs: 0,
        action: 'navigate',
        selector: 'http://localhost:3000',
        durationMs: 500,
        boundingBox: null,
      }],
    };
    const result = timelineSchema.safeParse(timeline);
    expect(result.success).toBe(true);
  });

  it('rejects narration with empty text', () => {
    const bad = {
      ...sampleTimeline,
      events: [{
        type: 'narration',
        id: 'ev-001',
        timestampMs: 0,
        text: '',
      }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects wait with zero duration', () => {
    const bad = {
      ...sampleTimeline,
      events: [{
        type: 'wait',
        id: 'ev-001',
        timestampMs: 0,
        durationMs: 0,
        reason: 'pacing',
      }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts empty events array', () => {
    const timeline = { ...sampleTimeline, events: [] };
    const result = timelineSchema.safeParse(timeline);
    expect(result.success).toBe(true);
  });

  it('validates cursor_target requires positive moveDurationMs', () => {
    const bad = {
      ...sampleTimeline,
      events: [{
        type: 'cursor_target',
        id: 'ev-001',
        timestampMs: 0,
        fromX: 0, fromY: 0,
        toX: 100, toY: 100,
        moveDurationMs: 0,
        easing: 'bezier',
      }],
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts frameManifest without videoFile', () => {
    const { videoFile, ...metaNoVideo } = sampleTimeline.metadata;
    const timeline = {
      ...sampleTimeline,
      metadata: {
        ...metaNoVideo,
        frameManifest: [
          { timestampMs: 0, file: 'frames/frame-000001.jpg' },
          { timestampMs: 500, file: 'frames/frame-000002.jpg' },
        ],
      },
    };
    const result = timelineSchema.safeParse(timeline);
    expect(result.success).toBe(true);
  });

  it('accepts videoFile without frameManifest (backward compat)', () => {
    const result = timelineSchema.safeParse(sampleTimeline);
    expect(result.success).toBe(true);
  });

  it('rejects neither videoFile nor frameManifest', () => {
    const { videoFile, ...metaNoVideo } = sampleTimeline.metadata;
    const bad = { ...sampleTimeline, metadata: metaNoVideo };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects empty frameManifest without videoFile', () => {
    const { videoFile, ...metaNoVideo } = sampleTimeline.metadata;
    const bad = {
      ...sampleTimeline,
      metadata: { ...metaNoVideo, frameManifest: [] },
    };
    const result = timelineSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
