import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SLIDE_DURATION_MS,
  resolveSlideScenes,
  resolveTransitions,
  computeOutputSegments,
  sourceTimeMs,
  totalSlideDurationMs,
  totalTransitionDurationMs,
  remapEvents,
} from '../../src/composition/time-remap.js';
import type { ResolvedSlideScene, ResolvedTransition } from '../../src/composition/time-remap.js';
import type { SceneEvent, SceneSlideConfig, ActionEvent, NarrationEvent, TransitionEvent, TimelineEvent } from '../../src/timeline/types.js';

function scene(timestampMs: number, title: string, opts?: { description?: string; slide?: SceneSlideConfig }): SceneEvent {
  return {
    type: 'scene', id: `s-${timestampMs}`, timestampMs, title,
    description: opts?.description,
    slide: opts?.slide,
  };
}

function ss(timestampMs: number, slideDurationMs: number = DEFAULT_SLIDE_DURATION_MS, eventIndex = 0): ResolvedSlideScene {
  return { timestampMs, slideDurationMs, eventIndex };
}

function action(timestampMs: number, settledAtMs?: number, settledSnapshot?: string): ActionEvent {
  return {
    type: 'action', id: `a-${timestampMs}`, timestampMs,
    action: 'click', selector: 'button', durationMs: 100,
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    ...(settledAtMs !== undefined ? { settledAtMs } : {}),
    ...(settledSnapshot ? { settledSnapshot } : {}),
  };
}

function transition(timestampMs: number, durationMs = 500, type: TransitionEvent['transition'] = 'fade', pageSnapshot?: string): TransitionEvent {
  return { type: 'transition', id: `t-${timestampMs}`, timestampMs, transition: type, durationMs, ...(pageSnapshot ? { pageSnapshot } : {}) };
}

function narration(timestampMs: number, text: string): NarrationEvent {
  return { type: 'narration', id: `n-${timestampMs}`, timestampMs, text };
}

function rt(
  timestampMs: number, durationMs: number,
  type: TransitionEvent['transition'] = 'fade',
  hasContentBefore = true, hasContentAfter = true,
  eventIndex = 0,
  beforeSnapshot: string | null = null,
  afterSnapshot: string | null = null,
): ResolvedTransition {
  return { timestampMs, transitionDurationMs: durationMs, transition: type, beforeSnapshot, afterSnapshot, hasContentBefore, hasContentAfter, eventIndex };
}

describe('DEFAULT_SLIDE_DURATION_MS', () => {
  it('is 2000', () => {
    expect(DEFAULT_SLIDE_DURATION_MS).toBe(2000);
  });
});

describe('resolveSlideScenes', () => {
  it('returns empty for scenes without slide', () => {
    const scenes = [scene(0, 'A'), scene(5000, 'B')];
    expect(resolveSlideScenes(scenes)).toEqual([]);
  });

  it('filters to scenes with slide field', () => {
    const scenes = [
      scene(0, 'A', { slide: {} }),
      scene(5000, 'B'),
      scene(10000, 'C', { slide: { duration: 3000 } }),
    ];
    const result = resolveSlideScenes(scenes);
    expect(result).toEqual([
      { timestampMs: 0, slideDurationMs: 2000, eventIndex: 0 },
      { timestampMs: 10000, slideDurationMs: 3000, eventIndex: 0 },
    ]);
  });

  it('populates eventIndex when allEvents is provided', () => {
    const s1 = scene(0, 'A', { slide: {} });
    const s2 = scene(5000, 'B');
    const s3 = scene(10000, 'C', { slide: { duration: 3000 } });
    const allEvents: TimelineEvent[] = [s1, s2, s3];
    const result = resolveSlideScenes([s1, s2, s3], allEvents);
    expect(result).toEqual([
      { timestampMs: 0, slideDurationMs: 2000, eventIndex: 0 },
      { timestampMs: 10000, slideDurationMs: 3000, eventIndex: 2 },
    ]);
  });

  it('uses default duration when slide.duration is omitted', () => {
    const scenes = [scene(0, 'A', { slide: {} })];
    expect(resolveSlideScenes(scenes)[0].slideDurationMs).toBe(2000);
  });

  it('uses custom duration from slide config', () => {
    const scenes = [scene(0, 'A', { slide: { duration: 5000 } })];
    expect(resolveSlideScenes(scenes)[0].slideDurationMs).toBe(5000);
  });
});

describe('resolveTransitions', () => {
  it('returns empty for no transitions', () => {
    const events: TimelineEvent[] = [action(0), action(1000)];
    expect(resolveTransitions(events)).toEqual([]);
  });

  it('resolves single transition with before/after actions', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300),
      action(600, 800),
    ];
    const result = resolveTransitions(events);
    expect(result).toEqual([
      { timestampMs: 500, transitionDurationMs: 300, transition: 'fade', beforeSnapshot: null, afterSnapshot: null, hasContentBefore: true, hasContentAfter: true, eventIndex: 1 },
    ]);
  });

  it('marks no content before when transition is first', () => {
    const events: TimelineEvent[] = [
      transition(0, 500),
      action(600, 800),
    ];
    const result = resolveTransitions(events);
    expect(result[0].hasContentBefore).toBe(false);
    expect(result[0].hasContentAfter).toBe(true);
  });

  it('marks no content after when transition is last', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300),
    ];
    const result = resolveTransitions(events);
    expect(result[0].hasContentBefore).toBe(true);
    expect(result[0].hasContentAfter).toBe(false);
  });

  it('marks both edges when no actions at all', () => {
    const events: TimelineEvent[] = [
      transition(0, 500),
    ];
    const result = resolveTransitions(events);
    expect(result[0].hasContentBefore).toBe(false);
    expect(result[0].hasContentAfter).toBe(false);
  });

  it('handles multiple transitions', () => {
    const events: TimelineEvent[] = [
      action(0, 50),
      transition(100, 200),
      action(200, 250),
      transition(300, 200),
      action(400, 450),
    ];
    const result = resolveTransitions(events);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ timestampMs: 100, hasContentBefore: true, hasContentAfter: true });
    expect(result[1]).toMatchObject({ timestampMs: 300, hasContentBefore: true, hasContentAfter: true });
  });

  it('populates beforeSnapshot from preceding action settledSnapshot', () => {
    const events: TimelineEvent[] = [
      action(0, 100, 'snapshots/snapshot-000001.jpg'),
      transition(500, 300),
      action(600, 800),
    ];
    const result = resolveTransitions(events);
    expect(result[0].beforeSnapshot).toBe('snapshots/snapshot-000001.jpg');
  });

  it('populates afterSnapshot from adjacent action settledSnapshot', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300),
      action(600, 800, 'snapshots/snapshot-000002.jpg'),
    ];
    const result = resolveTransitions(events);
    expect(result[0].afterSnapshot).toBe('snapshots/snapshot-000002.jpg');
  });

  it('falls back to pageSnapshot for beforeSnapshot when no action snapshot', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300, 'fade', 'snapshots/snapshot-000003.jpg'),
      action(600, 800),
    ];
    const result = resolveTransitions(events);
    // action has no settledSnapshot, so falls back to transition's pageSnapshot
    expect(result[0].beforeSnapshot).toBe('snapshots/snapshot-000003.jpg');
  });

  it('uses pageSnapshot for afterSnapshot when non-adjacent', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300, 'fade', 'snapshots/snapshot-000003.jpg'),
      narration(500, 'some text'),
      action(600, 800, 'snapshots/snapshot-000004.jpg'),
    ];
    const result = resolveTransitions(events);
    // Narration intervenes → non-adjacent → use pageSnapshot
    expect(result[0].afterSnapshot).toBe('snapshots/snapshot-000003.jpg');
  });

  it('returns null snapshots when events lack them', () => {
    const events: TimelineEvent[] = [
      action(0, 100),
      transition(500, 300),
      action(600, 800),
    ];
    const result = resolveTransitions(events);
    expect(result[0].beforeSnapshot).toBeNull();
    expect(result[0].afterSnapshot).toBeNull();
  });
});

describe('totalSlideDurationMs', () => {
  it('sums variable durations', () => {
    expect(totalSlideDurationMs([ss(0, 2000), ss(5000, 3000)])).toBe(5000);
  });

  it('returns 0 for empty array', () => {
    expect(totalSlideDurationMs([])).toBe(0);
  });

  it('works with single slide', () => {
    expect(totalSlideDurationMs([ss(0, 1500)])).toBe(1500);
  });
});

describe('totalTransitionDurationMs', () => {
  it('sums transition durations', () => {
    expect(totalTransitionDurationMs([
      rt(0, 500),
      rt(1000, 300),
    ])).toBe(800);
  });

  it('returns 0 for empty array', () => {
    expect(totalTransitionDurationMs([])).toBe(0);
  });
});

describe('buildSortedInsertions ordering', () => {
  it('preserves emission order when scenes and transitions share a timestamp', () => {
    // Simulates: scene(slide) → transition → scene(slide) → transition
    // all at the same source time (transition no longer consumes source time)
    const s1 = scene(0, 'Sharing with Spectra', { slide: { brandColor: '#000000', textColor: '#ffffff' } });
    const t1: TransitionEvent = { type: 'transition', id: 't-0a', timestampMs: 0, transition: 'fade', durationMs: 800 };
    const s2 = scene(0, 'Sharing a Workbook', { slide: {} });
    const t2: TransitionEvent = { type: 'transition', id: 't-0b', timestampMs: 0, transition: 'fade', durationMs: 500 };
    const allEvents: TimelineEvent[] = [s1, t1, s2, t2];

    const result = computeOutputSegments([s1, s2], resolveTransitions(allEvents), allEvents);

    // Expected order: Slide A → Fade 800 → Slide B → Fade 500
    expect(result.slides[0].sceneTitle).toBe('Sharing with Spectra');
    expect(result.slides[0].slideStartMs).toBe(0);
    expect(result.slides[0].slideEndMs).toBe(2000);

    expect(result.transitions[0].durationMs).toBe(800);
    expect(result.transitions[0].outputStartMs).toBe(2000);
    expect(result.transitions[0].outputEndMs).toBe(2800);

    expect(result.slides[1].sceneTitle).toBe('Sharing a Workbook');
    expect(result.slides[1].slideStartMs).toBe(2800);
    expect(result.slides[1].slideEndMs).toBe(4800);

    expect(result.transitions[1].durationMs).toBe(500);
    expect(result.transitions[1].outputStartMs).toBe(4800);
    expect(result.transitions[1].outputEndMs).toBe(5300);
  });
});

describe('computeOutputSegments', () => {
  it('returns empty for no slides or transitions', () => {
    const result = computeOutputSegments([scene(0, 'A')], []);
    expect(result.slides).toEqual([]);
    expect(result.transitions).toEqual([]);
  });

  it('computes single slide at t=0', () => {
    const scenes = [scene(0, 'Intro', { slide: {} })];
    const result = computeOutputSegments(scenes, []);
    expect(result.slides).toEqual([
      { slideStartMs: 0, slideEndMs: 2000, slideDurationMs: 2000, sceneTitle: 'Intro', sceneDescription: undefined, slideConfig: {} },
    ]);
  });

  it('computes slide + transition with correct offsets', () => {
    const scenes = [scene(0, 'Intro', { slide: {} })];
    const trans = [rt(0, 500)];
    const result = computeOutputSegments(scenes, trans);
    // Slide first (same source time, slides sort before transitions)
    expect(result.slides[0]).toMatchObject({ slideStartMs: 0, slideEndMs: 2000 });
    // Transition after slide
    expect(result.transitions[0]).toMatchObject({ outputStartMs: 2000, outputEndMs: 2500 });
  });

  it('interleaves slides and transitions correctly', () => {
    const scenes = [
      scene(0, 'Intro', { slide: {} }),
      scene(5000, 'Feature', { slide: {} }),
    ];
    const trans = [rt(5000, 500)];
    const result = computeOutputSegments(scenes, trans);

    // Slide A: source 0, output 0-2000
    expect(result.slides[0]).toMatchObject({ slideStartMs: 0, slideEndMs: 2000 });
    // Slide B: source 5000, accumulated = 2000, output 7000-9000
    expect(result.slides[1]).toMatchObject({ slideStartMs: 7000, slideEndMs: 9000 });
    // Transition: source 5000, but slides sort before transitions at same time
    // accumulated after slide A (2000) + slide B (2000) = 4000
    expect(result.transitions[0]).toMatchObject({ outputStartMs: 9000, outputEndMs: 9500 });
  });

  it('transition between two source-time positions', () => {
    const scenes: SceneEvent[] = [];
    const trans = [rt(3000, 500)];
    const result = computeOutputSegments(scenes, trans);
    expect(result.transitions[0]).toMatchObject({ outputStartMs: 3000, outputEndMs: 3500 });
  });

  it('propagates hasContentBefore/After flags to segments', () => {
    const trans = [
      rt(0, 500, 'fade', false, true),   // start edge
      rt(5000, 500, 'fade', true, false),  // end edge
    ];
    const result = computeOutputSegments([], trans);
    expect(result.transitions[0].hasContentBefore).toBe(false);
    expect(result.transitions[0].hasContentAfter).toBe(true);
    expect(result.transitions[1].hasContentBefore).toBe(true);
    expect(result.transitions[1].hasContentAfter).toBe(false);
  });

  it('propagates snapshot fields to segments', () => {
    const trans = [
      rt(3000, 500, 'fade', true, true, 0, 'snapshots/snapshot-000001.jpg', 'snapshots/snapshot-000002.jpg'),
    ];
    const result = computeOutputSegments([], trans);
    expect(result.transitions[0].beforeSnapshot).toBe('snapshots/snapshot-000001.jpg');
    expect(result.transitions[0].afterSnapshot).toBe('snapshots/snapshot-000002.jpg');
  });

  it('propagates null snapshots to segments', () => {
    const trans = [rt(3000, 500)];
    const result = computeOutputSegments([], trans);
    expect(result.transitions[0].beforeSnapshot).toBeNull();
    expect(result.transitions[0].afterSnapshot).toBeNull();
  });

  it('sets adjacentSlideBefore when slide precedes transition', () => {
    const scenes = [scene(0, 'Intro', { slide: {} })];
    const trans = [rt(0, 500)];
    const allEvents: TimelineEvent[] = [scenes[0], transition(0, 500)];
    const result = computeOutputSegments(scenes, trans, allEvents);
    expect(result.transitions[0].adjacentSlideBefore).toBe(0);
    expect(result.transitions[0].adjacentSlideAfter).toBeNull();
  });

  it('sets adjacentSlideAfter when slide follows transition', () => {
    const scenes = [scene(0, 'Intro', { slide: {} })];
    const trans = [rt(0, 500, 'fade', false, true, 0)];
    // transition first, then slide — eventIndex makes transition sort first at same timestamp
    // Actually we need the transition to come before the slide in insertion order.
    // With eventIndex 0 for transition and eventIndex 1 for slide at same timestamp:
    const allEvents: TimelineEvent[] = [
      { type: 'transition', id: 't-0', timestampMs: 0, transition: 'fade', durationMs: 500 } as TransitionEvent,
      scenes[0],
    ];
    const transResolved = resolveTransitions(allEvents);
    const result = computeOutputSegments(scenes, transResolved, allEvents);
    expect(result.transitions[0].adjacentSlideBefore).toBeNull();
    expect(result.transitions[0].adjacentSlideAfter).toBe(0);
  });

  it('sets both adjacentSlide fields for slide-transition-slide', () => {
    const s1 = scene(0, 'A', { slide: {} });
    const t1: TransitionEvent = { type: 'transition', id: 't-0', timestampMs: 0, transition: 'fade', durationMs: 500 };
    const s2 = scene(0, 'B', { slide: {} });
    const allEvents: TimelineEvent[] = [s1, t1, s2];
    const result = computeOutputSegments([s1, s2], resolveTransitions(allEvents), allEvents);
    expect(result.transitions[0].adjacentSlideBefore).toBe(0);
    expect(result.transitions[0].adjacentSlideAfter).toBe(1);
  });

  it('null adjacentSlide fields when transition is between actions', () => {
    const trans = [rt(3000, 500)];
    const result = computeOutputSegments([], trans);
    expect(result.transitions[0].adjacentSlideBefore).toBeNull();
    expect(result.transitions[0].adjacentSlideAfter).toBeNull();
  });

  it('does not link adjacency when slide and transition have different source times', () => {
    // Slide at t=0, then video content, then transition at t=5000, then slide at t=5000
    const s1 = scene(0, 'Intro', { slide: {} });
    const a1 = action(500);
    const t1: TransitionEvent = { type: 'transition', id: 't-5000', timestampMs: 5000, transition: 'fade', durationMs: 500 };
    const s2 = scene(5000, 'Feature', { slide: {} });
    const allEvents: TimelineEvent[] = [s1, a1, t1, s2];
    const result = computeOutputSegments([s1, s2], resolveTransitions(allEvents), allEvents);

    // Slide 'Intro' at sourceTime=0, transition at sourceTime=5000 — NOT adjacent
    expect(result.transitions[0].adjacentSlideBefore).toBeNull();
    // Slide 'Feature' at sourceTime=5000, transition at sourceTime=5000 — adjacent
    expect(result.transitions[0].adjacentSlideAfter).toBe(1);
  });
});

describe('sourceTimeMs', () => {
  it('identity when no insertions', () => {
    expect(sourceTimeMs(5000, [])).toBe(5000);
  });

  it('single slide at t=0: first 2s returns freeze-frame', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(0, slides)).toBe(0);
    expect(sourceTimeMs(1000, slides)).toBe(0);
    expect(sourceTimeMs(1999, slides)).toBe(0);
  });

  it('single slide at t=0: after slide maps back correctly', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(2000, slides)).toBe(0);
    expect(sourceTimeMs(5000, slides)).toBe(3000);
  });

  it('multiple slides: maps output to source correctly', () => {
    const slides = [ss(0), ss(8000), ss(15000)];

    // During first slide (0-2000 output): freeze at 0
    expect(sourceTimeMs(500, slides)).toBe(0);

    // Video segment after first slide: output 2000-10000 -> source 0-8000
    expect(sourceTimeMs(2000, slides)).toBe(0);
    expect(sourceTimeMs(6000, slides)).toBe(4000);

    // During second slide (10000-12000 output): freeze at 8000
    expect(sourceTimeMs(10000, slides)).toBe(8000);
    expect(sourceTimeMs(11000, slides)).toBe(8000);

    // Video after second slide: output 12000-19000 -> source 8000-15000
    expect(sourceTimeMs(12000, slides)).toBe(8000);
    expect(sourceTimeMs(15000, slides)).toBe(11000);

    // During third slide (19000-21000 output): freeze at 15000
    expect(sourceTimeMs(19000, slides)).toBe(15000);

    // After all slides: output 21000+ -> source 15000+
    expect(sourceTimeMs(21000, slides)).toBe(15000);
    expect(sourceTimeMs(26000, slides)).toBe(20000);
  });

  it('variable durations: maps correctly', () => {
    const slides = [ss(0, 1000), ss(5000, 3000)];

    expect(sourceTimeMs(500, slides)).toBe(0);
    expect(sourceTimeMs(1000, slides)).toBe(0);
    expect(sourceTimeMs(3000, slides)).toBe(2000);

    expect(sourceTimeMs(6000, slides)).toBe(5000);
    expect(sourceTimeMs(8000, slides)).toBe(5000);

    expect(sourceTimeMs(9000, slides)).toBe(5000);
    expect(sourceTimeMs(11000, slides)).toBe(7000);
  });

  it('exact slide boundary returns source time after slide', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(2000, slides)).toBe(0);
  });

  it('single transition inserts output time', () => {
    const trans = [rt(3000, 500)];
    // Before transition: identity
    expect(sourceTimeMs(2000, [], trans)).toBe(2000);
    // During transition (3000-3500): freeze at 3000
    expect(sourceTimeMs(3000, [], trans)).toBe(3000);
    expect(sourceTimeMs(3250, [], trans)).toBe(3000);
    expect(sourceTimeMs(3499, [], trans)).toBe(3000);
    // After transition: subtract 500
    expect(sourceTimeMs(3500, [], trans)).toBe(3000);
    expect(sourceTimeMs(4000, [], trans)).toBe(3500);
  });

  it('slide + transition at same source time', () => {
    const slides = [ss(0, 2000)];
    const trans = [rt(0, 500)];
    // Slide at source 0: output 0-2000, freeze at 0
    expect(sourceTimeMs(1000, slides, trans)).toBe(0);
    // Transition at source 0: output 2000-2500, freeze at 0
    expect(sourceTimeMs(2000, slides, trans)).toBe(0);
    expect(sourceTimeMs(2250, slides, trans)).toBe(0);
    // After both (total inserted = 2500): output 2500 -> source 0
    expect(sourceTimeMs(2500, slides, trans)).toBe(0);
    expect(sourceTimeMs(3500, slides, trans)).toBe(1000);
  });

  it('mixed slides and transitions at different times', () => {
    const slides = [ss(0, 2000)];
    const trans = [rt(5000, 500)];
    // During slide (0-2000): freeze at 0
    expect(sourceTimeMs(1000, slides, trans)).toBe(0);
    // After slide, before transition: output 2000-7000 -> source 0-5000
    expect(sourceTimeMs(4000, slides, trans)).toBe(2000);
    // During transition (7000-7500): freeze at 5000
    expect(sourceTimeMs(7000, slides, trans)).toBe(5000);
    expect(sourceTimeMs(7250, slides, trans)).toBe(5000);
    // After transition: output - 2500
    expect(sourceTimeMs(7500, slides, trans)).toBe(5000);
    expect(sourceTimeMs(8500, slides, trans)).toBe(6000);
  });
});

describe('remapEvents', () => {
  it('returns same timestamps when no insertions', () => {
    const events = [action(1000), action(5000)];
    const result = remapEvents(events, []);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 5000]);
  });

  it('does not mutate original events', () => {
    const events = [action(1000)];
    const slides = [ss(0)];
    const result = remapEvents(events, slides);
    expect(events[0].timestampMs).toBe(1000);
    expect(result[0].timestampMs).toBe(3000);
  });

  it('shifts events by accumulated slide durations', () => {
    const slides = [ss(0), ss(8000)];
    const events = [
      action(500),
      action(4000),
      narration(8000, 'hi'),
      action(10000),
    ];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([2500, 6000, 12000, 14000]);
  });

  it('events before first slide get no offset', () => {
    const slides = [ss(5000)];
    const events = [action(1000), action(6000)];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 8000]);
  });

  it('handles variable slide durations', () => {
    const slides = [ss(0, 1000), ss(5000, 3000)];
    const events = [
      action(500),
      action(5000),
      action(8000),
    ];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([1500, 9000, 12000]);
  });

  it('remaps with both slides and transitions', () => {
    const slides = [ss(0, 2000)];
    const trans = [rt(5000, 500)];
    const events = [
      action(500),    // after slide 0 (2000ms) -> +2000 = 2500
      action(5000),   // after slide 0 + transition (2500ms) -> +2500 = 7500
      action(8000),   // after slide 0 + transition -> +2500 = 10500
    ];
    const result = remapEvents(events, slides, trans);
    expect(result.map(e => e.timestampMs)).toEqual([2500, 7500, 10500]);
  });

  it('remaps transition events correctly when slides precede them', () => {
    const slides = [ss(0)]; // 2000ms slide at t=0
    const t: TransitionEvent = {
      type: 'transition', id: 't-5000', timestampMs: 5000, transition: 'fade', durationMs: 500,
    };
    const result = remapEvents([t], slides);
    expect(result[0].timestampMs).toBe(7000);
    expect(result[0].type).toBe('transition');
  });
});
