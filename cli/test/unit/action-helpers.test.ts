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
  it('scene() with string description emits scene event without slide', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro', 'The beginning');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('scene');
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBe('The beginning');
    expect(ev.slide).toBeUndefined();
  });

  it('scene() with no second arg emits scene event without slide', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBeUndefined();
    expect(ev.slide).toBeUndefined();
  });

  it('scene() with empty slide object emits slide with defaults', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro', { slide: {} });
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBeUndefined();
    expect(ev.slide).toEqual({});
  });

  it('scene() with description-only object does not emit slide', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro', { description: 'The beginning' });
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBe('The beginning');
    expect(ev.slide).toBeUndefined();
  });

  it('scene() with full options passes description and slide config', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.scene('Intro', {
      description: 'The beginning',
      slide: {
        duration: 3000,
        brandColor: '#4F46E5',
        textColor: '#FFFFFF',
        fontFamily: 'Inter',
        titleFontSize: 72,
      },
    });
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBe('The beginning');
    expect(ev.slide).toEqual({
      duration: 3000,
      brandColor: '#4F46E5',
      textColor: '#FFFFFF',
      fontFamily: 'Inter',
      titleFontSize: 72,
    });
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

  it('fill() types characters with fixed delay', async () => {
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

  it('navigate() emits action event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.navigate('http://localhost:3000');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('navigate');
  });

  it('wait() emits a pacing wait event and waits real time', async () => {
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
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
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

  it('narration waits full estimated duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.narrate('This is a test narration with several words.');
    const events = collector.getEvents();

    const waitEvent = events.find(e => e.type === 'wait' && (e as any).reason === 'narration_sync') as any;
    expect(waitEvent).toBeDefined();

    // 8 words → (8/150) * 60 * 1000 = 3200ms
    expect(waitEvent.durationMs).toBe(3200);
    expect(page.waitForTimeout).toHaveBeenCalledWith(3200);
  });

  it('click() does not emit post-action wait', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.click('.btn');
    const events = collector.getEvents();
    const waits = events.filter(e => e.type === 'wait');
    expect(waits).toHaveLength(0);
  });

  it('cursor move waits real time for natural pacing', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    collector.start();
    const sw = createHelpers(page, collector);

    await sw.click('.btn');

    // cursor move should call page.waitForTimeout with the move duration
    const cursorEvent = collector.getEvents().find(e => e.type === 'cursor_target') as any;
    expect(page.waitForTimeout).toHaveBeenCalledWith(cursorEvent.moveDurationMs);
  });
});
