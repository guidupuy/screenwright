import type { ActionEvent, SceneEvent, SceneSlideConfig, TimelineEvent, TransitionEvent, TransitionType } from '../timeline/types.js';

export const DEFAULT_SLIDE_DURATION_MS = 2000;

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export interface ResolvedSlideScene {
  timestampMs: number;
  slideDurationMs: number;
  /** Position in the original events array (for stable sort order). */
  eventIndex: number;
}

export interface ResolvedTransition {
  timestampMs: number;
  transitionDurationMs: number;
  transition: TransitionType;
  /** Snapshot file path for exit content (before transition). */
  beforeSnapshot: string | null;
  /** Snapshot file path for entrance content (after transition). */
  afterSnapshot: string | null;
  /** True when a visual action exists before this transition. */
  hasContentBefore: boolean;
  /** True when a visual action exists after this transition. */
  hasContentAfter: boolean;
  /** Position in the original events array (for stable sort order). */
  eventIndex: number;
}

export interface SlideSegment {
  slideStartMs: number;
  slideEndMs: number;
  slideDurationMs: number;
  sceneTitle: string;
  sceneDescription?: string;
  slideConfig: SceneSlideConfig;
}

export interface TransitionSegment {
  outputStartMs: number;
  outputEndMs: number;
  durationMs: number;
  transition: TransitionType;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  /** Index into the slides array for the adjacent slide before, or null. */
  adjacentSlideBefore: number | null;
  /** Index into the slides array for the adjacent slide after, or null. */
  adjacentSlideAfter: number | null;
  hasContentBefore: boolean;
  hasContentAfter: boolean;
}

/**
 * Filter scenes that have a `slide` field and resolve their duration.
 * Pass allEvents to get correct eventIndex for stable ordering with transitions.
 */
export function resolveSlideScenes(
  scenes: SceneEvent[],
  allEvents?: readonly TimelineEvent[],
): ResolvedSlideScene[] {
  return scenes
    .filter(s => s.slide !== undefined)
    .map(s => ({
      timestampMs: s.timestampMs,
      slideDurationMs: s.slide!.duration ?? DEFAULT_SLIDE_DURATION_MS,
      eventIndex: allEvents ? allEvents.indexOf(s) : 0,
    }));
}

/**
 * Walk timeline events and resolve each transition's snapshot references.
 *
 * Uses **array position** to find surrounding actions. Adjacency matters:
 * if the next action is directly adjacent (no narration/wait/scene between,
 * cursor_target events are transparent), use its settledSnapshot. Otherwise
 * fall back to the transition's own pageSnapshot.
 */
export function resolveTransitions(events: TimelineEvent[]): ResolvedTransition[] {
  const result: ResolvedTransition[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== 'transition') continue;

    let lastBefore: ActionEvent | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (events[j].type === 'action') { lastBefore = events[j] as ActionEvent; break; }
    }

    let firstAfter: ActionEvent | null = null;
    let adjacent = true;
    for (let j = i + 1; j < events.length; j++) {
      if (events[j].type === 'action') { firstAfter = events[j] as ActionEvent; break; }
      if (events[j].type !== 'cursor_target') adjacent = false;
    }

    const te = event as TransitionEvent;
    result.push({
      timestampMs: event.timestampMs,
      transitionDurationMs: event.durationMs,
      transition: event.transition,
      beforeSnapshot: lastBefore?.settledSnapshot ?? te.pageSnapshot ?? null,
      afterSnapshot: firstAfter && adjacent
        ? (firstAfter.settledSnapshot ?? null)
        : (te.pageSnapshot ?? null),
      hasContentBefore: lastBefore !== null,
      hasContentAfter: firstAfter !== null,
      eventIndex: i,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Internal: unified insertion abstraction for slides + transitions  */
/* ------------------------------------------------------------------ */

interface Insertion {
  sourceTimeMs: number;
  durationMs: number;
  kind: 'slide' | 'transition';
  eventIndex: number;
}

function buildSortedInsertions(
  slideScenes: ResolvedSlideScene[],
  transitions: ResolvedTransition[],
): Insertion[] {
  const ins: Insertion[] = [];
  for (const ss of slideScenes) {
    ins.push({ sourceTimeMs: ss.timestampMs, durationMs: ss.slideDurationMs, kind: 'slide', eventIndex: ss.eventIndex });
  }
  for (const t of transitions) {
    ins.push({ sourceTimeMs: t.timestampMs, durationMs: t.transitionDurationMs, kind: 'transition', eventIndex: t.eventIndex });
  }
  ins.sort((a, b) => a.sourceTimeMs - b.sourceTimeMs || a.eventIndex - b.eventIndex);
  return ins;
}

/**
 * Map an output-time position back to its source-time position.
 * During an insertion (slide or transition), returns the insertion's
 * source timestamp (freeze-frame). Otherwise subtracts accumulated offsets.
 */
export function sourceTimeMs(
  outputTimeMs: number,
  slideScenes: ResolvedSlideScene[],
  transitions: ResolvedTransition[] = [],
): number {
  const insertions = buildSortedInsertions(slideScenes, transitions);
  let accumulated = 0;
  for (const ins of insertions) {
    const start = ins.sourceTimeMs + accumulated;
    const end = start + ins.durationMs;
    if (outputTimeMs < start) return outputTimeMs - accumulated;
    if (outputTimeMs < end) return ins.sourceTimeMs;
    accumulated += ins.durationMs;
  }
  return outputTimeMs - accumulated;
}

export function totalSlideDurationMs(slideScenes: ResolvedSlideScene[]): number {
  let total = 0;
  for (const ss of slideScenes) total += ss.slideDurationMs;
  return total;
}

export function totalTransitionDurationMs(transitions: ResolvedTransition[]): number {
  let total = 0;
  for (const t of transitions) total += t.transitionDurationMs;
  return total;
}

/**
 * Compute output-time intervals for both slides and transitions,
 * accounting for all preceding insertions.
 */
export function computeOutputSegments(
  scenes: SceneEvent[],
  transitions: ResolvedTransition[],
  allEvents?: readonly TimelineEvent[],
): { slides: SlideSegment[]; transitions: TransitionSegment[] } {
  const slideScenes = resolveSlideScenes(scenes, allEvents);
  const insertions = buildSortedInsertions(slideScenes, transitions);

  // Build queues sorted by eventIndex (matching insertion sort order within each kind).
  const slideQueue = scenes.filter(s => s.slide);
  if (allEvents) {
    slideQueue.sort((a, b) => allEvents.indexOf(a) - allEvents.indexOf(b));
  }
  const transQueue = [...transitions].sort((a, b) => a.eventIndex - b.eventIndex);
  let si = 0;
  let ti = 0;

  const slides: SlideSegment[] = [];
  const transSegs: TransitionSegment[] = [];

  // First pass: build all segments in insertion order, tracking which are slides vs transitions.
  interface SegEntry { kind: 'slide' | 'transition'; index: number }
  const segOrder: SegEntry[] = [];

  let accumulated = 0;
  for (const ins of insertions) {
    const outputStart = ins.sourceTimeMs + accumulated;
    const outputEnd = outputStart + ins.durationMs;

    if (ins.kind === 'slide') {
      const sc = slideQueue[si++];
      if (sc) {
        segOrder.push({ kind: 'slide', index: slides.length });
        slides.push({
          slideStartMs: outputStart,
          slideEndMs: outputEnd,
          slideDurationMs: ins.durationMs,
          sceneTitle: sc.title,
          sceneDescription: sc.description,
          slideConfig: sc.slide!,
        });
      }
    } else {
      const rt = transQueue[ti++];
      if (rt) {
        segOrder.push({ kind: 'transition', index: transSegs.length });
        transSegs.push({
          outputStartMs: outputStart,
          outputEndMs: outputEnd,
          durationMs: ins.durationMs,
          transition: rt.transition,
          beforeSnapshot: rt.beforeSnapshot,
          afterSnapshot: rt.afterSnapshot,
          adjacentSlideBefore: null,
          adjacentSlideAfter: null,
          hasContentBefore: rt.hasContentBefore,
          hasContentAfter: rt.hasContentAfter,
        });
      }
    }

    accumulated += ins.durationMs;
  }

  // Second pass: link transitions to adjacent slides when they share
  // the same source timestamp (no video content gap between them).
  for (let k = 0; k < segOrder.length; k++) {
    if (segOrder[k].kind !== 'transition') continue;
    const seg = transSegs[segOrder[k].index];
    if (k > 0 && segOrder[k - 1].kind === 'slide'
        && insertions[k].sourceTimeMs === insertions[k - 1].sourceTimeMs) {
      seg.adjacentSlideBefore = segOrder[k - 1].index;
    }
    if (k < segOrder.length - 1 && segOrder[k + 1].kind === 'slide'
        && insertions[k].sourceTimeMs === insertions[k + 1].sourceTimeMs) {
      seg.adjacentSlideAfter = segOrder[k + 1].index;
    }
  }

  return { slides, transitions: transSegs };
}

/**
 * Shift every event's timestampMs forward by accumulated insertion
 * durations (slides + transitions) that precede it.
 * Returns a new array (no mutation).
 */
export function remapEvents<T extends TimelineEvent>(
  events: T[],
  slideScenes: ResolvedSlideScene[],
  transitions: ResolvedTransition[] = [],
): T[] {
  const insertions = buildSortedInsertions(slideScenes, transitions);
  return events.map(event => {
    let offset = 0;
    for (const ins of insertions) {
      if (event.timestampMs >= ins.sourceTimeMs) {
        offset += ins.durationMs;
      } else {
        break;
      }
    }
    return { ...event, timestampMs: event.timestampMs + offset };
  });
}
