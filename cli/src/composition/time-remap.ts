import type { SceneEvent, SceneSlideConfig, TimelineEvent } from '../timeline/types.js';

export const DEFAULT_SLIDE_DURATION_MS = 2000;

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export interface ResolvedSlideScene {
  timestampMs: number;
  slideDurationMs: number;
}

export interface SlideSegment {
  slideStartMs: number;
  slideEndMs: number;
  slideDurationMs: number;
  sceneTitle: string;
  sceneDescription?: string;
  slideConfig: SceneSlideConfig;
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
 * Compute the output-time intervals where each scene slide is shown.
 * Each slide is inserted *before* the scene's recorded content.
 */
export function computeSlideSegments(scenes: SceneEvent[]): SlideSegment[] {
  const segments: SlideSegment[] = [];
  let accumulated = 0;

  for (const scene of scenes) {
    if (!scene.slide) continue;

    const slideDurationMs = scene.slide.duration ?? DEFAULT_SLIDE_DURATION_MS;
    const slideStartMs = scene.timestampMs + accumulated;

    segments.push({
      slideStartMs,
      slideEndMs: slideStartMs + slideDurationMs,
      slideDurationMs,
      sceneTitle: scene.title,
      sceneDescription: scene.description,
      slideConfig: scene.slide,
    });
    accumulated += slideDurationMs;
  }
  return segments;
}

/**
 * Map an output-time position back to its source-time position.
 * During a slide, returns the scene's timestamp (freeze-frame).
 * During video segments, subtracts accumulated slide durations.
 */
export function sourceTimeMs(
  outputTimeMs: number,
  slideScenes: ResolvedSlideScene[],
): number {
  const sorted = [...slideScenes].sort((a, b) => a.timestampMs - b.timestampMs);
  let accumulated = 0;
  for (const ss of sorted) {
    const slideStart = ss.timestampMs + accumulated;
    const slideEnd = slideStart + ss.slideDurationMs;

    if (outputTimeMs < slideStart) {
      return outputTimeMs - accumulated;
    }
    if (outputTimeMs < slideEnd) {
      return ss.timestampMs;
    }
    accumulated += ss.slideDurationMs;
  }
  return outputTimeMs - accumulated;
}

export function totalSlideDurationMs(
  slideScenes: ResolvedSlideScene[],
): number {
  let total = 0;
  for (const ss of slideScenes) {
    total += ss.slideDurationMs;
  }
  return total;
}

/**
 * Shift every event's timestampMs forward by the accumulated slide
 * durations that precede it. Returns a new array (no mutation).
 */
export function remapEvents<T extends TimelineEvent>(
  events: T[],
  slideScenes: ResolvedSlideScene[],
): T[] {
  const sorted = [...slideScenes].sort((a, b) => a.timestampMs - b.timestampMs);
  return events.map(event => {
    let offset = 0;
    for (const ss of sorted) {
      if (event.timestampMs >= ss.timestampMs) {
        offset += ss.slideDurationMs;
      } else {
        break;
      }
    }
    return { ...event, timestampMs: event.timestampMs + offset };
  });
}
