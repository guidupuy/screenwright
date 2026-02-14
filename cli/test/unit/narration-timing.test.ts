import { describe, it, expect, vi } from 'vitest';
import type { Timeline } from '../../src/timeline/types.js';

// Mock both engines before importing narration-timing
vi.mock('../../src/voiceover/piper-engine.js', () => ({
  synthesize: vi.fn().mockImplementation(async (text: string, outputPath: string) => ({
    audioPath: outputPath,
    durationMs: text.split(/\s+/).length * 400, // ~150 WPM estimate
  })),
}));

vi.mock('../../src/voiceover/openai-engine.js', () => ({
  synthesize: vi.fn().mockImplementation(async (text: string, outputPath: string) => ({
    audioPath: outputPath,
    durationMs: text.split(/\s+/).length * 350,
  })),
}));

import { generateNarration } from '../../src/voiceover/narration-timing.js';

function makeTimeline(events: Timeline['events']): Timeline {
  return {
    version: 1,
    metadata: {
      testFile: 'test.spec.ts',
      scenarioFile: 'demo.ts',
      recordedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      videoDurationMs: 10000,
      videoFile: '/tmp/test.webm',
    },
    events,
  };
}

describe('generateNarration', () => {
  it('updates narration events with audioFile and audioDurationMs', async () => {
    const timeline = makeTimeline([
      { type: 'scene', id: 'ev-001', timestampMs: 0, title: 'Intro' },
      { type: 'narration', id: 'ev-002', timestampMs: 500, text: 'Hello world' },
      { type: 'narration', id: 'ev-003', timestampMs: 2000, text: 'This is a demo of the product' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp' });

    const narrations = result.events.filter(e => e.type === 'narration');
    expect(narrations).toHaveLength(2);

    for (const n of narrations) {
      expect((n as any).audioFile).toBeDefined();
      expect((n as any).audioDurationMs).toBeGreaterThan(0);
    }
  });

  it('preserves non-narration events unchanged', async () => {
    const timeline = makeTimeline([
      { type: 'scene', id: 'ev-001', timestampMs: 0, title: 'Start' },
      { type: 'narration', id: 'ev-002', timestampMs: 500, text: 'Hello' },
      { type: 'wait', id: 'ev-003', timestampMs: 1000, durationMs: 500, reason: 'pacing' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp' });

    expect(result.events[0]).toEqual(timeline.events[0]);
    expect(result.events[2]).toEqual(timeline.events[2]);
  });

  it('handles timeline with no narration events', async () => {
    const timeline = makeTimeline([
      { type: 'scene', id: 'ev-001', timestampMs: 0, title: 'Start' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp' });
    expect(result.events).toEqual(timeline.events);
  });

  it('generates unique audio filenames per narration', async () => {
    const timeline = makeTimeline([
      { type: 'narration', id: 'ev-001', timestampMs: 0, text: 'First' },
      { type: 'narration', id: 'ev-002', timestampMs: 1000, text: 'Second' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp' });
    const files = result.events.map(e => (e as any).audioFile);
    expect(files[0]).not.toBe(files[1]);
  });

  it('uses .wav extension for piper provider', async () => {
    const timeline = makeTimeline([
      { type: 'narration', id: 'ev-001', timestampMs: 0, text: 'Hello' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp', ttsProvider: 'piper' });
    expect((result.events[0] as any).audioFile).toMatch(/\.wav$/);
  });

  it('uses .mp3 extension for openai provider', async () => {
    const timeline = makeTimeline([
      { type: 'narration', id: 'ev-001', timestampMs: 0, text: 'Hello' },
    ]);

    const result = await generateNarration(timeline, { tempDir: '/tmp', ttsProvider: 'openai' });
    expect((result.events[0] as any).audioFile).toMatch(/\.mp3$/);
  });
});
