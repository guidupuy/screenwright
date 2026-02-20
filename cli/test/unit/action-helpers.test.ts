import { describe, it, expect, vi } from 'vitest';
import { calculateMoveDuration, createHelpers, type RecordingContext } from '../../src/runtime/action-helpers.js';
import { TimelineCollector } from '../../src/runtime/timeline-collector.js';
import type { ManifestEntry, TransitionMarker } from '../../src/timeline/types.js';

function mockPage() {
  const locator = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 120, height: 40 }),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
    locator: vi.fn().mockReturnValue({ first: () => locator }),
    evaluate: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('http://localhost:3000'),
    _locator: locator,
  } as any;
}

function mockRecordingContext(narrations: { text: string; audioFile: string; durationMs: number }[] = []): RecordingContext {
  const manifest: ManifestEntry[] = [];
  const markers: TransitionMarker[] = [];
  let virtualFrameIndex = 0;
  let narrationIdx = 0;

  const ctx: RecordingContext = {
    captureTransitionFrame: vi.fn().mockImplementation(async () => {
      return `frames/transition-${String(Math.random()).slice(2, 6)}.jpg`;
    }),
    addTransitionMarker: vi.fn().mockImplementation((marker: TransitionMarker) => {
      markers.push(marker);
    }),
    popNarration: vi.fn().mockImplementation(() => {
      if (narrationIdx >= narrations.length) throw new Error('No narrations');
      return narrations[narrationIdx++];
    }),
    currentTimeMs: vi.fn().mockImplementation(() => virtualFrameIndex * (1000 / 30)),
    get manifest() { return manifest; },
    transitionPending: false,
  };
  return ctx;
}

describe('calculateMoveDuration', () => {
  it('returns minimum 200ms for short distances', () => {
    expect(calculateMoveDuration(0, 0, 5, 5)).toBe(200);
  });

  it('returns maximum 800ms for very long distances', () => {
    expect(calculateMoveDuration(0, 0, 5000, 5000)).toBe(800);
  });

  it('scales with distance', () => {
    const short = calculateMoveDuration(0, 0, 50, 50);
    const long = calculateMoveDuration(0, 0, 500, 500);
    expect(long).toBeGreaterThan(short);
  });
});

describe('createHelpers', () => {
  // Capture loop runs continuously — helpers never pause/resume it.

  it('scene() without slide emits scene event only', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('scene');
    expect((events[0] as any).title).toBe('Intro');
  });

  it('scene() with string description emits scene event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro', 'The beginning');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBe('The beginning');
  });

  it('scene() with slide injects DOM overlay and sleeps for duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro', { slide: { brandColor: '#4F46E5', duration: 3000 } });

    // DOM injection + removal via page.evaluate
    expect(page.evaluate).toHaveBeenCalled();
    // Sleeps for slide duration — capture loop records frames throughout
    expect(page.waitForTimeout).toHaveBeenCalledWith(3000);
  });

  it('click() emits cursor_target then action events', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.btn');
    const events = collector.getEvents();

    const types = events.map(e => e.type);
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
    expect(types.indexOf('cursor_target')).toBeLessThan(types.indexOf('action'));
  });

  it('click() with narration emits narration at start, sleeps for remainder', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Click the button', audioFile: '/tmp/n0.wav', durationMs: 5000 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.btn', { narration: 'Click the button' });
    const events = collector.getEvents();
    const types = events.map(e => e.type);

    // Narration emitted at start (concurrent with action)
    expect(types[0]).toBe('narration');
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
    // Sleeps for remaining narration time after action settles
    expect(page.waitForTimeout).toHaveBeenCalled();
  });

  it('fill() types characters with fixed delay', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.fill('.input', 'abc');
    expect(page.keyboard.type).toHaveBeenCalledTimes(3);
    expect(page.keyboard.type).toHaveBeenCalledWith('a', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('b', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('c', { delay: 30 });
  });

  it('navigate() emits action event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.navigate('http://localhost:3000');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('navigate');
  });

  it('navigate() with narration emits narration concurrently then action', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Go to the page', audioFile: '/tmp/n0.wav', durationMs: 800 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.navigate('http://localhost:3000', { narration: 'Go to the page' });
    const events = collector.getEvents();
    const types = events.map(e => e.type);

    expect(types[0]).toBe('narration');
    expect(types).toContain('action');
  });

  it('wait() emits wait event and sleeps', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.wait(2000);
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('wait');
    expect((events[0] as any).durationMs).toBe(2000);
    expect((events[0] as any).reason).toBe('pacing');
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it('press() emits action event with key as selector', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.press('Enter');
    const events = collector.getEvents();

    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('press');
    expect((events[0] as any).selector).toBe('Enter');
  });

  it('updates cursor position across actions', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.first');
    await sw.click('.second');

    const cursorEvents = collector.getEvents().filter(e => e.type === 'cursor_target');
    expect(cursorEvents).toHaveLength(2);

    const second = cursorEvents[1] as any;
    const firstTarget = cursorEvents[0] as any;
    expect(second.fromX).toBe(firstTarget.toX);
    expect(second.fromY).toBe(firstTarget.toY);
  });

  it('narrate() emits narration event and sleeps for duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Test narration', audioFile: '/tmp/n0.wav', durationMs: 2000 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.narrate('Test narration');

    expect(ctx.popNarration).toHaveBeenCalled();
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);

    const narrationEvent = collector.getEvents().find(e => e.type === 'narration') as any;
    expect(narrationEvent.text).toBe('Test narration');
    expect(narrationEvent.audioFile).toBe('/tmp/n0.wav');
    expect(narrationEvent.audioDurationMs).toBe(2000);
  });

  it('transition() adds marker at current manifest position', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition();

    expect(ctx.addTransitionMarker).toHaveBeenCalled();
  });

  it('transition() passes through custom type and duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition({ type: 'wipe', duration: 800 });

    const markerCall = (ctx.addTransitionMarker as any).mock.calls[0][0];
    expect(markerCall.transition).toBe('wipe');
    expect(markerCall.durationFrames).toBe(24); // ceil(800/1000 * 30)
  });

  it('transition() throws on zero duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: 0 })).rejects.toThrow('positive number');
  });

  it('transition() throws on negative duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: -100 })).rejects.toThrow('positive number');
  });

  it('transition() throws on NaN duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: NaN })).rejects.toThrow('positive number');
  });

  it('hover() emits cursor_target and action events', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.hover('.menu');
    const types = collector.getEvents().map(e => e.type);

    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
    expect((collector.getEvents().find(e => e.type === 'action') as any).action).toBe('hover');
  });
});
