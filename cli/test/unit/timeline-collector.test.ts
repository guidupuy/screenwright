import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineCollector } from '../../src/runtime/timeline-collector.js';

describe('TimelineCollector', () => {
  let collector: TimelineCollector;

  beforeEach(() => {
    collector = new TimelineCollector();
    collector.start();
  });

  it('generates sequential event IDs', () => {
    const id1 = collector.emit({ type: 'scene', title: 'First' });
    const id2 = collector.emit({ type: 'scene', title: 'Second' });
    expect(id1).toBe('ev-001');
    expect(id2).toBe('ev-002');
  });

  it('auto-assigns timestamps from elapsed time', () => {
    collector.emit({ type: 'scene', title: 'Test' });
    const events = collector.getEvents();
    expect(events[0].timestampMs).toBeGreaterThanOrEqual(0);
  });

  it('allows explicit ID and timestamp overrides', () => {
    collector.emit({ type: 'scene', id: 'custom-1', timestampMs: 42, title: 'Test' });
    const events = collector.getEvents();
    expect(events[0].id).toBe('custom-1');
    expect(events[0].timestampMs).toBe(42);
  });

  it('throws when emitting before start()', () => {
    const fresh = new TimelineCollector();
    expect(() => fresh.emit({ type: 'scene', title: 'Oops' })).toThrow('not started');
  });

  it('finalize() produces valid timeline JSON', () => {
    collector.emit({ type: 'scene', id: 'ev-001', timestampMs: 0, title: 'Start' });
    collector.emit({
      type: 'action', id: 'ev-002', timestampMs: 100,
      action: 'click', selector: '.btn', durationMs: 200,
      boundingBox: { x: 10, y: 20, width: 100, height: 50 },
    });

    const timeline = collector.finalize({
      testFile: 'test.spec.ts',
      scenarioFile: 'demo.ts',
      recordedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      videoDurationMs: 300,
      videoFile: '/tmp/test.webm',
    });

    expect(timeline.version).toBe(1);
    expect(timeline.events).toHaveLength(2);
  });

  it('finalize() rejects invalid events', () => {
    collector.emit({ type: 'bogus', id: 'ev-001', timestampMs: 0 });
    expect(() => collector.finalize({
      testFile: 'test.spec.ts',
      scenarioFile: 'demo.ts',
      recordedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      videoDurationMs: 0,
      videoFile: '/tmp/test.webm',
    })).toThrow('Invalid timeline');
  });

  it('events have monotonically non-decreasing timestamps', async () => {
    collector.emit({ type: 'scene', title: 'A' });
    await new Promise(r => setTimeout(r, 5));
    collector.emit({ type: 'scene', title: 'B' });
    await new Promise(r => setTimeout(r, 5));
    collector.emit({ type: 'scene', title: 'C' });

    const events = collector.getEvents();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestampMs).toBeGreaterThanOrEqual(events[i - 1].timestampMs);
    }
  });

  describe('virtual time', () => {
    it('advance() sets elapsed time', () => {
      const c = new TimelineCollector();
      c.start();
      c.enableVirtualTime();
      c.advance(500);
      expect(c.elapsed()).toBe(500);
    });

    it('multiple advances accumulate', () => {
      const c = new TimelineCollector();
      c.start();
      c.enableVirtualTime();
      c.advance(200);
      c.advance(300);
      c.advance(100);
      expect(c.elapsed()).toBe(600);
    });

    it('advance() is no-op in real mode', () => {
      const c = new TimelineCollector();
      c.start();
      c.advance(99999);
      // elapsed() should return wall-clock time, not 99999
      expect(c.elapsed()).toBeLessThan(100);
    });
  });
});
