import type { ActionEvent, SceneEvent, SceneSlideConfig, TimelineEvent, TransitionType } from '../timeline/types.js';

export const DEFAULT_SLIDE_DURATION_MS = 2000;

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export interface ResolvedSlideScene {
  timestampMs: number;
  slideDurationMs: number;
}

export interface ResolvedTransition {
  timestampMs: number;
  transitionDurationMs: number;
  transition: TransitionType;
  beforeSourceMs: number;
  afterSourceMs: number;
  /** True when a visual action exists before this transition. */
  hasContentBefore: boolean;
  /** True when a visual action exists after this transition. */
  hasContentAfter: boolean;
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
  beforeSourceMs: number;
  afterSourceMs: number;
  hasContentBefore: boolean;
  hasContentAfter: boolean;
}

/**
 * Filter scenes that have a `slide` field and resolve their duration.
 */
export function resolveSlideScenes(scenes: SceneEvent[]): ResolvedSlideScene[] {
  return scenes
    .filter(s => s.slide !== undefined)
    .map(s => ({
      timestampMs: s.timestampMs,
      slideDurationMs: s.slide!.duration ?? DEFAULT_SLIDE_DURATION_MS,
    }));
}

/**
 * Walk timeline events and resolve each transition's frame references.
 * beforeSourceMs = settledAtMs (or timestampMs) of the last visual action before it.
 * afterSourceMs = settledAtMs (or timestampMs) of the first visual action after it.
 */
export function resolveTransitions(events: TimelineEvent[]): ResolvedTransition[] {
  const result: ResolvedTransition[] = [];
  const actions = events.filter((e): e is ActionEvent => e.type === 'action');

  for (const event of events) {
    if (event.type !== 'transition') continue;

    const lastBefore = findLastAction(actions, event.timestampMs);
    const firstAfter = actions.find(a => a.timestampMs > event.timestampMs) ?? null;

    result.push({
      timestampMs: event.timestampMs,
      transitionDurationMs: event.durationMs,
      transition: event.transition,
      beforeSourceMs: lastBefore
        ? (lastBefore.settledAtMs ?? lastBefore.timestampMs)
        : event.timestampMs,
      afterSourceMs: firstAfter
        ? (firstAfter.settledAtMs ?? firstAfter.timestampMs)
        : event.timestampMs,
      hasContentBefore: lastBefore !== null,
      hasContentAfter: firstAfter !== null,
    });
  }

  return result;
}

function findLastAction(actions: ActionEvent[], beforeOrAt: number): ActionEvent | null {
  let last: ActionEvent | null = null;
  for (const a of actions) {
    if (a.timestampMs <= beforeOrAt) last = a;
    else break;
  }
  return last;
}

/* ------------------------------------------------------------------ */
/*  Internal: unified insertion abstraction for slides + transitions  */
/* ------------------------------------------------------------------ */

interface Insertion {
  sourceTimeMs: number;
  durationMs: number;
  kind: 'slide' | 'transition';
}

function buildSortedInsertions(
  slideScenes: ResolvedSlideScene[],
  transitions: ResolvedTransition[],
): Insertion[] {
  const ins: Insertion[] = [];
  for (const ss of slideScenes) {
    ins.push({ sourceTimeMs: ss.timestampMs, durationMs: ss.slideDurationMs, kind: 'slide' });
  }
  for (const t of transitions) {
    ins.push({ sourceTimeMs: t.timestampMs, durationMs: t.transitionDurationMs, kind: 'transition' });
  }
  // Slides sort before transitions at the same source time; stable for same-kind ties.
  ins.sort((a, b) => a.sourceTimeMs - b.sourceTimeMs || (a.kind === b.kind ? 0 : a.kind === 'slide' ? -1 : 1));
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
): { slides: SlideSegment[]; transitions: TransitionSegment[] } {
  const slideScenes = resolveSlideScenes(scenes);
  const insertions = buildSortedInsertions(slideScenes, transitions);

  // Build queues (same order as sorted insertions) so we pop metadata
  // in order even when multiple insertions share the same timestamp.
  const slideQueue = scenes.filter(s => s.slide).sort((a, b) => a.timestampMs - b.timestampMs);
  const transQueue = [...transitions].sort((a, b) => a.timestampMs - b.timestampMs);
  let si = 0;
  let ti = 0;

  const slides: SlideSegment[] = [];
  const transSegs: TransitionSegment[] = [];

  let accumulated = 0;
  for (const ins of insertions) {
    const outputStart = ins.sourceTimeMs + accumulated;
    const outputEnd = outputStart + ins.durationMs;

    if (ins.kind === 'slide') {
      const sc = slideQueue[si++];
      if (sc) {
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
        transSegs.push({
          outputStartMs: outputStart,
          outputEndMs: outputEnd,
          durationMs: ins.durationMs,
          transition: rt.transition,
          beforeSourceMs: rt.beforeSourceMs,
          afterSourceMs: rt.afterSourceMs,
          hasContentBefore: rt.hasContentBefore,
          hasContentAfter: rt.hasContentAfter,
        });
      }
    }

    accumulated += ins.durationMs;
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
