import type { FrameEntry } from '../timeline/types.js';

/**
 * Binary search for the frame with the largest timestampMs <= timeMs.
 * Returns first frame if timeMs is before all entries, last if after all.
 * Throws on empty manifest.
 */
export function findClosestFrame(manifest: readonly FrameEntry[], timeMs: number): FrameEntry {
  if (manifest.length === 0) throw new Error('Empty frame manifest');

  let lo = 0;
  let hi = manifest.length - 1;

  if (timeMs <= manifest[0].timestampMs) return manifest[0];
  if (timeMs >= manifest[hi].timestampMs) return manifest[hi];

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (manifest[mid].timestampMs <= timeMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return manifest[hi];
}
