import { describe, it, expect, vi } from 'vitest';
import { calculateMoveDuration, createHelpers } from '../../src/runtime/action-helpers.js';
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

describe('calculateMoveDuration', () => {
  it('returns minimum 300ms for short distances', () => {
    expect(calculateMoveDuration(0, 0, 5, 5)).toBe(300);
  });

  it('returns maximum 1200ms for very long distances', () => {
    expect(calculateMoveDuration(0, 0, 5000, 5000)).toBe(1200);
  });

  it('scales with distance', () => {
    const short = calculateMoveDuration(0, 0, 50, 50);
    const long = calculateMoveDuration(0, 0, 500, 500);
    expect(long).toBeGreaterThan(short);
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

  it('fill() types characters individually', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.fill('.input', 'abc');
    expect(page.keyboard.type).toHaveBeenCalledTimes(3);
    expect(page.keyboard.type).toHaveBeenCalledWith('a', { delay: 50 });
    expect(page.keyboard.type).toHaveBeenCalledWith('b', { delay: 50 });
    expect(page.keyboard.type).toHaveBeenCalledWith('c', { delay: 50 });
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

  it('wait() emits a pacing wait event', async () => {
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
});
