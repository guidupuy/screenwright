import type { ManifestEntry, TransitionMarker, TransitionType, TimelineEvent } from '../timeline/types.js';

const FRAME_MS = 1000 / 30;

export interface SourceFrameResolution {
  type: 'source';
  file: string;
}

export interface TransitionFrameResolution {
  type: 'transition';
  beforeFile: string;
  afterFile: string;
  progress: number;
  transition: TransitionType;
}

export type FrameResolution = SourceFrameResolution | TransitionFrameResolution;

/** Total source frames (expanding holds). */
export function expandedFrameCount(manifest: ManifestEntry[]): number {
  let count = 0;
  for (const e of manifest) {
    count += e.type === 'hold' ? e.count : 1;
  }
  return count;
}

/** Get image file for a source frame index. */
export function sourceFrameImage(manifest: ManifestEntry[], sourceFrame: number): string {
  let accumulated = 0;
  for (const entry of manifest) {
    const count = entry.type === 'hold' ? entry.count : 1;
    if (sourceFrame < accumulated + count) return entry.file;
    accumulated += count;
  }
  return manifest[manifest.length - 1].file;
}

/**
 * Convert a manifest entry index to an expanded source frame index.
 * Returns the first expanded frame of the given entry.
 */
function entryFrameCount(entry: ManifestEntry): number {
  return entry.type === 'hold' ? entry.count : 1;
}

function entryToSourceFrame(manifest: ManifestEntry[], entryIndex: number): number {
  let frame = 0;
  for (let i = 0; i < entryIndex && i < manifest.length; i++) {
    frame += entryFrameCount(manifest[i]);
  }
  return frame;
}

function lastSourceFrameOfEntry(manifest: ManifestEntry[], entryIndex: number): number {
  return entryToSourceFrame(manifest, entryIndex) + entryFrameCount(manifest[entryIndex]) - 1;
}

/** Total output frames accounting for transition insertions. */
export function totalOutputFrames(manifest: ManifestEntry[], transitions: TransitionMarker[]): number {
  const source = expandedFrameCount(manifest);
  let inserted = 0;
  let consumed = 0;
  for (const t of transitions) {
    inserted += t.durationFrames;
    consumed += t.consumedFrames ?? 1;
  }
  return source + inserted - consumed;
}

/**
 * Resolve what to render for a given output frame.
 *
 * Transitions are sorted by afterEntryIndex. For each transition at expanded
 * source frame S:
 * - Source frames 0..S map 1:1 to output
 * - Output frames S+1..S+durationFrames are the transition animation
 * - Source frame S+1 (the first expanded frame of the next entry) is consumed
 * - Source frames S+2.. resume 1:1 with accumulated offset
 */
export function resolveOutputFrame(
  outputFrame: number,
  manifest: ManifestEntry[],
  transitions: TransitionMarker[],
): FrameResolution {
  const sorted = [...transitions].sort((a, b) => a.afterEntryIndex - b.afterEntryIndex);

  let offset = 0; // accumulated shift: inserted frames minus consumed frames

  for (const t of sorted) {
    const sourceS = lastSourceFrameOfEntry(manifest, t.afterEntryIndex);

    // The output frame where the source frame S lives
    const outputS = sourceS + offset;

    // Transition occupies output frames (outputS + 1) through (outputS + durationFrames)
    const transStart = outputS + 1;
    const transEnd = outputS + t.durationFrames;

    if (outputFrame <= outputS) {
      // Before this transition: resolve as source
      break;
    }

    if (outputFrame >= transStart && outputFrame <= transEnd) {
      const progress = (outputFrame - transStart + 1) / t.durationFrames;
      const beforeFile = t.beforeFile ?? sourceFrameImage(manifest, sourceS);
      const afterEntryIdx = t.afterEntryIndex + 1;
      const afterFile = t.afterFile
        ?? (afterEntryIdx < manifest.length ? manifest[afterEntryIdx].file : manifest[manifest.length - 1].file);
      return { type: 'transition', beforeFile, afterFile, progress, transition: t.transition };
    }

    // Past this transition: update offset
    const consumed = t.consumedFrames ?? 1;
    offset += t.durationFrames - consumed;
  }

  // Map output frame back to source frame
  const sourceFrame = outputFrame - offset;
  const clamped = Math.max(0, Math.min(sourceFrame, expandedFrameCount(manifest) - 1));
  return { type: 'source', file: sourceFrameImage(manifest, clamped) };
}

/**
 * Offset event timestamps to account for transition insertions.
 * Each transition at source frame S inserts (durationFrames - 1) extra frames worth of time.
 * Events after each transition get shifted forward.
 */
export function remapEventsForOutput<T extends TimelineEvent>(
  events: T[],
  manifest: ManifestEntry[],
  transitions: TransitionMarker[],
): T[] {
  const sorted = [...transitions].sort((a, b) => a.afterEntryIndex - b.afterEntryIndex);

  return events.map(event => {
    let offsetMs = 0;
    for (const t of sorted) {
      // Convert transition's afterEntryIndex to a source timestamp
      const sourceS = lastSourceFrameOfEntry(manifest, t.afterEntryIndex);
      const transitionSourceMs = sourceS * FRAME_MS;

      if (event.timestampMs > transitionSourceMs) {
        const consumed = t.consumedFrames ?? 1;
        offsetMs += (t.durationFrames - consumed) * FRAME_MS;
      }
    }
    if (offsetMs === 0) return event;
    return { ...event, timestampMs: event.timestampMs + offsetMs };
  });
}
