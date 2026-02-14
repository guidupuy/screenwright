import { describe, it, expect, vi } from 'vitest';
import { calculateMoveDuration, createHelpers, getPacingMultiplier, getNarrationOverlap } from '../../src/runtime/action-helpers.js';
import { TimelineCollector } from '../../src/runtime/timeline-collector.js';

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
    _locator: locator,
  } as any;
}

describe('getPacingMultiplier', () => {
  it('returns 0.15 for fast', () => {
    expect(getPacingMultiplier('fast')).toBe(0.15);
  });

  it('returns 0.5 for normal', () => {
    expect(getPacingMultiplier('normal')).toBe(0.5);
  });

  it('returns 1.0 for cinematic', () => {
    expect(getPacingMultiplier('cinematic')).toBe(1.0);
  });
});

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

  it('applies pacing multiplier', () => {
    const base = calculateMoveDuration(0, 0, 200, 200);
    const fast = calculateMoveDuration(0, 0, 200, 200, 0.15);
    const slow = calculateMoveDuration(0, 0, 200, 200, 2.0);
    expect(fast).toBeLessThan(base);
    expect(slow).toBeGreaterThan(base);
  });
});

describe('createHelpers', () => {
  it('scene() emits a scene event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro', 'The beginning');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('scene');
    expect((events[0] as any).title).toBe('Intro');
  });

  it('click() emits cursor_target then action events', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.click('.btn');
    const events = collector.getEvents();

    const types = events.map(e => e.type);
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
    expect(types.indexOf('cursor_target')).toBeLessThan(types.indexOf('action'));
  });

  it('click() with narration emits narration first', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.click('.btn', { narration: 'Click the button' });
    const events = collector.getEvents();
    const types = events.map(e => e.type);

    expect(types[0]).toBe('narration');
    expect(types[1]).toBe('wait');
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
  });

  it('fill() types characters with scaled delay', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.fill('.input', 'abc');
    expect(page.keyboard.type).toHaveBeenCalledTimes(3);
    expect(page.keyboard.type).toHaveBeenCalledWith('a', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('b', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('c', { delay: 30 });
  });

  it('navigate() emits action + page_load wait', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.navigate('http://localhost:3000');
    const events = collector.getEvents();

    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('navigate');
    expect(events[1].type).toBe('wait');
    expect((events[1] as any).reason).toBe('page_load');
  });

  it('wait() emits a pacing wait event (unscaled)', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.wait(2000);
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('wait');
    expect((events[0] as any).durationMs).toBe(2000);
    expect((events[0] as any).reason).toBe('pacing');
  });

  it('press() emits action event with key as selector', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.press('Enter');
    const events = collector.getEvents();

    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('press');
    expect((events[0] as any).selector).toBe('Enter');
  });

  it('updates cursor position across actions', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.click('.first');
    await sw.click('.second');

    const cursorEvents = collector.getEvents().filter(e => e.type === 'cursor_target');
    expect(cursorEvents).toHaveLength(2);

    // Second cursor move should start from where first ended
    const second = cursorEvents[1] as any;
    const firstTarget = cursorEvents[0] as any;
    expect(second.fromX).toBe(firstTarget.toX);
    expect(second.fromY).toBe(firstTarget.toY);
  });

  it('fast pacing scales post-action delay', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector, { pacingMultiplier: 0.15 });

    await sw.click('.btn');

    // Post-action delay: Math.round(300 * 0.15) = 45
    const lastCall = page.waitForTimeout.mock.calls.at(-1);
    expect(lastCall![0]).toBe(45);
  });

  it('narration overlap reduces wait duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector, { narrationOverlap: 0.4, pacingMultiplier: 1.0 });

    await sw.narrate('This is a test narration with several words.');
    const events = collector.getEvents();

    const waitEvent = events.find(e => e.type === 'wait' && (e as any).reason === 'narration_sync') as any;
    expect(waitEvent).toBeDefined();

    // 8 words → (8/150) * 60 * 1000 = 3200ms estimated
    // actualWait = Math.round(3200 * 0.4 * 1.0) = 1280
    expect(waitEvent.durationMs).toBe(1280);
  });

  it('onFrame is called for click, fill, hover, press, navigate, wait', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const onFrame = vi.fn().mockResolvedValue(undefined);
    const sw = createHelpers(page, collector, { onFrame });

    await sw.click('.btn');
    expect(onFrame).toHaveBeenCalledTimes(1);

    onFrame.mockClear();
    await sw.fill('.input', 'abc');
    expect(onFrame).toHaveBeenCalledTimes(1);

    onFrame.mockClear();
    await sw.hover('.link');
    expect(onFrame).toHaveBeenCalledTimes(1);

    onFrame.mockClear();
    await sw.press('Enter');
    expect(onFrame).toHaveBeenCalledTimes(1);

    onFrame.mockClear();
    await sw.navigate('http://localhost:3000');
    expect(onFrame).toHaveBeenCalledTimes(1);

    onFrame.mockClear();
    await sw.wait(1000);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('virtualTime uses collector.advance instead of real waits', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    collector.enableVirtualTime();
    const sw = createHelpers(page, collector, { virtualTime: true });

    await sw.wait(5000);
    // Virtual time should have advanced
    expect(collector.elapsed()).toBe(5000);
    // In virtual mode, page.waitForTimeout is NOT called with 5000
    // (it may be called with settle=0, which skips)
    const calls = page.waitForTimeout.mock.calls;
    for (const call of calls) {
      expect(call[0]).not.toBe(5000);
    }
  });
});
